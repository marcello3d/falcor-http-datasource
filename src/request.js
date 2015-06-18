'use strict';
var Observable = require('falcor').Observable;
var getXMLHttpRequest = require('./getXMLHttpRequest');
var getCORSRequest = require('./getCORSRequest');
var hasOwnProp = Object.prototype.hasOwnProperty;

function request(method, options, context) {
    return Observable.create(function(observer) {
        var config = {
            method: 'GET',
            crossDomain: false,
            async: true,
            headers: {},
            responseType: 'json'
        };
        var xhr,
            isDone,
            headers,
            header,
            prop;

        for (prop in options) {
            if (hasOwnProp.call(options, prop)) {
                config[prop] = options[prop];
            }
        }

        try {
            xhr = config.crossDomain ? getCORSRequest() : getXMLHttpRequest();
        } catch (err) {
            observer.onError(err);
        }

        // Add request with Headers
        if (!config.crossDomain && !config.headers['X-Requested-With']) {
          config.headers['X-Requested-With'] = 'XMLHttpRequest';
        }


        try {
            // Takes the url and opens the connection
            if (config.user) {
                xhr.open(method || config.method, config.url, config.async, config.user, config.password);
            } else {
                xhr.open(method || config.method, config.url, config.async);
            }

            // Sets timeout information
            xhr.timeout = config.timeout;

            // Anything but explicit false results in true.
            xhr.withCredentials = config.withCredentials !== false;

            // Fills the request headers
            headers = config.headers;
            for (header in headers) {
                if (hasOwnProp.call(headers, header)) {
                    xhr.setRequestHeader(header, headers[header]);
                }
            }

            if (config.responseType) {
                try {
                    xhr.responseType = config.responseType;
                } catch (e) {
                    // WebKit added support for the json responseType value on 09/03/2013
                    // https://bugs.webkit.org/show_bug.cgi?id=73648. Versions of Safari prior to 7 are
                    // known to throw when setting the value "json" as the response type. Other older
                    // browsers implementing the responseType
                    //
                    // The json response type can be ignored if not supported, because JSON payloads are
                    // parsed on the client-side regardless.
                    if (responseType !== 'json') {
                        throw e;
                    }
                }
            }

            xhr.onreadystatechange = function onreadystatechange(e) {
                // Complete
                if (xhr.readyState === 4) {
                    if (!isDone) {
                        isDone = true;
                        onXhrLoad(observer, xhr, status, e, context);
                    }
                }
            };

            // Timeout
            xhr.ontimeout = function ontimeout(e) {
                if (!isDone) {
                    isDone = true;
                    onXhrError(observer, xhr, 'timeout error', e);
                }
            };

            // Send Request
            if (context.onBeforeRequest != null) {
                context.onBeforeRequest(config);
            }
            xhr.send(config.data);

        } catch (e) {
            observer.onError(e);
        }
        // Dispose
        return function dispose() {
            // Doesn't work in IE9
            if (!isDone && xhr.readyState !== 4) {
                isDone = true;
                xhr.abort();
            }
        };//Dispose
    });
}

/*
 * General handling of ultimate failure (after appropriate retries)
 */
function _handleXhrError(observer, textStatus, errorThrown) {
    // IE9: cross-domain request may be considered errors
    if (!errorThrown) {
        errorThrown = new Error(textStatus);
    }

    observer.onError(errorThrown);
}

function onXhrLoad(observer, xhr, status, e, context) {
    var responseData,
        responseObject;
        // responseType;

    // If there's no observer, the request has been (or is being) cancelled.
    if (xhr && observer) {
        // responseText is the old-school way of retrieving response (supported by IE8 & 9)
        // response/responseType properties were introduced in XHR Level2 spec (supported by IE10)
        responseData = ('response' in xhr) ? xhr.response : xhr.responseText;

        // normalize IE9 bug (http://bugs.jquery.com/ticket/1450)
        var status = (xhr.status === 1223) ? 204 : xhr.status;

        if (status >= 200 && status <= 399) {
            try {
                responseData = context.responseTransform(responseData || '');
            } catch (e) {
                _handleXhrError(observer, 'invalid json', e);
            }
            observer.onNext(responseData);
            observer.onCompleted();
            return;

        } else if (status === 401 || status === 403 || status === 407) {

            return _handleXhrError(observer, responseData);

        } else if (status === 410) {
            // TODO: Retry ?
            return _handleXhrError(observer, responseData);

        } else if (status === 408 || status === 504) {
            // TODO: Retry ?
            return _handleXhrError(observer, responseData);

        } else {

            return _handleXhrError(observer, responseData || ('Response code ' + status));

        }//if
    }//if
}//onXhrLoad

function onXhrError(observer, xhr, status, e) {
    _handleXhrError(observer, status || xhr.statusText || 'request error', e);
}

module.exports = request;
