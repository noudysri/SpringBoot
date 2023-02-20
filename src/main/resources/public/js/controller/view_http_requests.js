
app.controller('viewHttpRequestsController', function($scope, $http, $timeout, $uibModal, $uibModalInstance, utils, restClient, globalVars, auth) {


    //
    // Constants / Vars
    var AlertTimeoutMillis = globalVars.AlertTimeoutMillis;
    var InitPageTimeoutMillis = 1500;
    var WebSocketHeartBeatMillis = 30000;
    var LiveLoggingAmendment = 'LIVE_LOGGING_AMENDMENT';
    var RequestDirectionValue = 'REQUEST';
    var ResponseDirectionValue = 'RESPONSE';
    var BlockedResponseType = 'BLOCKED_RESPONSE';
    var EnableLiveLogBlocking = 'ENABLE_LIVE_LOG_BLOCKING';
    var DisableLiveLogBlocking = 'DISABLE_LIVE_LOG_BLOCKING';
    var ProxiedDownstreamUrlResponseHeader = 'X-Proxied-Downstream-Url';
    $scope.JsonContentType = globalVars.JsonContentType;
    $scope.XmlContentType = globalVars.XmlContentType;
    $scope.contentTypes = globalVars.ContentMimeTypes;
    $scope.SmockinTraceIdHeader = 'X-Smockin-Trace-ID';
    $scope.TrafficType = 'TRAFFIC';
    $scope.S3Type = 'S3';
    var ContentTypeHeader = 'Content-Type';
    var wsProtocol = (utils.isSecureConnectionType())
                         ? "wss://"
                         : "ws://";
    var LiveFeedUrl = wsProtocol
                        + location.host
                        + "/liveLoggingFeed";


    //
    // Labels
    $scope.viewRequestsHeading = 'Live Feed';
    $scope.noActivityData = 'Listening for activity...';

    $scope.statusLabel = 'Status';
    $scope.headersLabel = 'Headers';
    $scope.parametersLabel = 'Parameters';
    $scope.bodyLabel = 'Body';
    $scope.requestSearchPlaceholderText = 'Enter a keyword to filter results below...';
    $scope.connectionStatusLabel = 'Connection Status';
    $scope.connectionStatusOfflineLabel = 'OFFLINE';
    $scope.connectionStatusOnlineLabel = 'ONLINE';
    $scope.noFeedRecordSelected = 'Nothing Selected';
    $scope.requestLabel = 'Request';
    $scope.responseLabel = 'Response';
    $scope.s3DetailsLabel = 'S3 Details';
    $scope.httpResponseLabel = 'HTTP Response:';
    $scope.proxiedResponseOriginPrefix = 'Origin';
    $scope.formatJsonLabel = 'Validate & Format JSON';
    $scope.formatXmlLabel = 'Validate & Format XML';
    $scope.releaseInterceptedResponseButton = 'Release Response';
    $scope.manageLabel = 'manage';
    $scope.blockedLabel = '(intercepted)';
    $scope.addHeaderLabel = '+ Add Header';
    $scope.enableResponseInterceptorLabel = 'Enable HTTP Response Interceptor';
    $scope.interceptEndpointLabel = '+ intercept';
    $scope.s3Label = 'S3';


    //
    // Buttons
    $scope.closeButtonLabel = 'Close';
    $scope.clearFeedButtonLabel = 'Clear List';
    $scope.removeResponseHeaderRowButtonLabel = 'X';


    //
    // Alerts
    var timeOutPromise = null;
    $scope.alerts = [];

    var closeAlertFunc = function() {
        $scope.alerts = [];
    };

   function showAlert(msg, type) {

        if (timeOutPromise != null) {
            $timeout.cancel(timeOutPromise);
        }

        closeAlertFunc();

        if (type == null) {
            type = 'danger';
        }

        $scope.alerts.push({ "type" : type, "msg" : msg });

        timeOutPromise = $timeout(closeAlertFunc, AlertTimeoutMillis);
    }

    $scope.closeAlert = closeAlertFunc;


    //
    // Data Objects
    var wsSocket = null;
    $scope.activityFeed = [];
    $scope.wsEstablished = false;
    $scope.sortType = 'name';
    $scope.sortReverse = false;
    $scope.search = '';
    $scope.selectedFeedData = null;
    $scope.responseInterceptorEnabled = false;
    $scope.endpointsToBlock = [];


    //
    // Scoped Functions
    $scope.doConvertHttpHeaders = function(headers) {

        var allHeaders = [];

        if (headers == null || headers.length == 0) {
            return allHeaders;
        }

        for (var h in headers) {
            if (headers.hasOwnProperty(h)
                    && h != ProxiedDownstreamUrlResponseHeader) {
              allHeaders.push(h + ": " + headers[h]);
            }
        }

        return allHeaders;
    };

    $scope.doViewFeedRow = function(f) {
        if ($scope.selectedFeedData != null) {
            $scope.selectedFeedData.isSelected = false;
        }
        $scope.selectedFeedData = f;
        f.isSelected = true;
    };

    $scope.doClearFeed = function() {
        $scope.activityFeed = [];
        $scope.selectedFeedData = null;
    };

    $scope.doClose = function() {
        doTerminate();
        $uibModalInstance.close();
    };

    $scope.doQuickAddEndpointForInterception = function(request) {

        $scope.closeAlert();

        var req = {
            'method' : request.method,
            'path' : request.url
        };

        restClient.doPost($http, '/mockedserver/config/' + globalVars.RestfulServerType + '/live-logging-block/endpoint', req, function(status, data) {

            if (status == 400) {

                 showAlert(data.message);
                 return;
            } else if (status != 200) {

                 showAlert(globalVars.GeneralErrorMessage);
                 return;
            }

            var placeHolderRecord = ($scope.endpointsToBlock.length > 0)
                                        ? $scope.endpointsToBlock[$scope.endpointsToBlock.length - 1]
                                        : null;

            if (placeHolderRecord != null
                    && placeHolderRecord.id == null) {

                placeHolderRecord.id = utils.generateUUID();
                placeHolderRecord.method = req.method;
                placeHolderRecord.path = req.path;

            } else {

                $scope.endpointsToBlock.push({
                    "id" : utils.generateUUID(),
                    "method" : req.method,
                    "path" : req.path
                });

            }

            doAddNewEndpointInterceptRow();

        });

    };

    $scope.isListedForIntercept = function (request) {

        for (var e=0; e < $scope.endpointsToBlock.length; e++) {
            if ($scope.endpointsToBlock[e].method == request.method
                    && $scope.endpointsToBlock[e].path == request.url) {
                return true;
            }
        }

        return false;
    };

    $scope.doToggleResponseInterceptor = function() {

        $scope.responseInterceptorEnabled = !$scope.responseInterceptorEnabled;

        if (wsSocket != null
                && wsSocket.readyState == wsSocket.OPEN) {

            var payload = {
                'type' : ($scope.responseInterceptorEnabled)
                             ? EnableLiveLogBlocking
                             : DisableLiveLogBlocking
            };

            wsSocket.send(JSON.stringify(payload));
        }

        if (!$scope.responseInterceptorEnabled) {
            $scope.endpointsToBlock = [];
        }

    };

    $scope.doManageBlockedEndpoints = function() {

        var modalInstance = $uibModal.open({
            templateUrl: 'view_http_requests_block_endpoints.html',
            controller: 'viewHttpRequestsBlockEndpointsController',
            backdrop  : 'static',
            keyboard  : false,
            resolve: {
                data: function () {
                    return {
                        "endpoints" : $scope.endpointsToBlock
                    };
                }
            }
        });

        modalInstance.result.then(function (endpoints) {
            $scope.endpointsToBlock = endpoints;
        }, function (data) {
            $scope.endpointsToBlock = endpoints;
        });

    };

    $scope.doReleaseBlockedLog = function() {

        $scope.closeAlert();

        if (!utils.isNumeric($scope.selectedFeedData.amendedResponse.status)) {
            showAlert("Amended response status must be a numeric value");
            return;
        }

        if (!validateAmendedResponseHeadersAreAllPopulated()) {
            showAlert("Amended response headers are not all defined");
            return;
        }

        if (doAmendedResponseHeadersContainDuplicates()) {
            showAlert("You have duplicated response headers");
            return;
        }


        var req = {
            'type' : LiveLoggingAmendment,
            'payload' : {
                'traceId' : $scope.selectedFeedData.amendedResponse.traceId,
                'status' : $scope.selectedFeedData.amendedResponse.status,
                'headers' : convertKVPListToMap($scope.selectedFeedData.amendedResponse.headers),
                'body' : $scope.selectedFeedData.amendedResponse.body
            }
        };

        if (wsSocket != null
                && wsSocket.readyState == wsSocket.OPEN) {

            wsSocket.send(JSON.stringify(req));

            $scope.selectedFeedData.amendedResponse = null
        }

    };

    $scope.doFormatJson = function() {

        $scope.closeAlert();

        if ($scope.selectedFeedData.amendedResponse.body == null) {
            return;
        }

        var validationOutcome = utils.validateJson($scope.selectedFeedData.amendedResponse.body);

        if (validationOutcome != null) {
            showAlert(validationOutcome);
            return;
        }

        $scope.selectedFeedData.amendedResponse.body = utils.formatJson($scope.selectedFeedData.amendedResponse.body);
    };

    $scope.doFormatXml = function() {

        $scope.closeAlert();

        if ($scope.selectedFeedData.amendedResponse.body == null) {
            return;
        }

        var validationOutcome = utils.validateAndFormatXml($scope.selectedFeedData.amendedResponse.body);

        if (validationOutcome == null) {
            showAlert("Unable to format XML. Invalid syntax");
            return;
        }

        if (validationOutcome[0] == 'ERROR') {
            showAlert("Unable to format XML: " + validationOutcome[1]);
            return;
        }

        $scope.selectedFeedData.amendedResponse.body = validationOutcome[1];
    };

    $scope.doAddAmendedHeaderRow = function() {

        $scope.closeAlert();

        if (!validateAmendedResponseHeadersAreAllPopulated()) {
            showAlert("Please populate all current headers first");
            return;
        }

        $scope.selectedFeedData
            .amendedResponse
            .headers.push({
                 "key" : null,
                 "value" : null
             });

    };

    $scope.extractContentTypeHeaderValue = function(headers) {

        for (var h=0; h < $scope.selectedFeedData.amendedResponse.headers.length; h++) {
            if ($scope.selectedFeedData.amendedResponse.headers[h].key == ContentTypeHeader) {
                return $scope.selectedFeedData.amendedResponse.headers[h].value;
            }
        }

    };

    $scope.doAddRemoveResponseHeader = function(key) {

        for (var h=0; h < $scope.selectedFeedData.amendedResponse.headers.length; h++) {
            if ($scope.selectedFeedData.amendedResponse.headers[h].key == key) {
                $scope.selectedFeedData.amendedResponse.headers.splice(h, 1);
            }
        }

    }


    //
    // Internal Functions
    var doConnectFunc = function () {

        // Check the mock server is running and the port no
        utils.checkRestServerStatus(function(running, port) {

            $scope.doClearFeed();

            if (running == null) {
                showAlert(globalVars.GeneralErrorMessage);
                return;
            }

            if (!running) {
                showAlert("Cannot establish connection. The mock server is not currently running.");
                return;
            }

            var showForAllUsers = false;

            try {

                // Establish connection to WS endpoint
                wsSocket = new WebSocket(LiveFeedUrl + "/" + showForAllUsers + "/" + auth.getToken());

                applyWSListeners();

            } catch (err) {

                showAlert("Unable to establish connection to " + LiveFeedUrl);
                wsSocket = null;

                return;
            }

        });

    };

    function doTerminate() {

        if (wsSocket != null) {

            wsSocket.close();
            wsSocket = null;
        }

    };

    function applyWSListeners() {

       wsSocket.onopen = function (event) {

            $scope.doClearFeed();
            $scope.noActivityData = 'Listening for activity...';
            $scope.wsEstablished = true;
            $scope.$digest();

            keepWsAlive();
        };

        wsSocket.onmessage = function (event) {
            handleResponseMsg(JSON.parse(event.data));
        };

        wsSocket.onerror = function (event) {

            showAlert("Unable to establish connection to " + LiveFeedUrl);

            wsSocket = null;
            $scope.wsEstablished = false;
            $scope.$digest();
        };

        wsSocket.onclose = function (event) {

            wsSocket = null;
            $scope.wsEstablished = false;
            $scope.$digest();

            cancelKeepAlive();
        };

    }

    var wsHbTimerPromise = null;

    var keepWsAlive = function() {

        if (wsSocket != null
                && wsSocket.readyState == wsSocket.OPEN) {
            wsSocket.send('');
        } else {
            cancelKeepAlive();
        }

        wsHbTimerPromise = $timeout(keepWsAlive, WebSocketHeartBeatMillis);
    };

    function cancelKeepAlive() {

        if (wsHbTimerPromise != null) {
            $timeout.cancel(wsHbTimerPromise);
        }
    }

    function handleResponseMsg(inboundMsg) {

        if (inboundMsg.type == BlockedResponseType) {

            amendActivityFeedWithBlockedResponse(inboundMsg.payload);

        } else if (inboundMsg.type == $scope.TrafficType) {

            var liveLog = inboundMsg.payload;

            if (liveLog.direction == RequestDirectionValue) {
                buildInitialRequest(liveLog);
            } else if (liveLog.direction == ResponseDirectionValue) {
                appendResponse(liveLog);
            }

        } else if (inboundMsg.type == $scope.S3Type) {

            buildS3Response(inboundMsg.payload);

        }

    }

    function buildS3Response(action) {

        var s3Data = {
            'type' : $scope.S3Type,
            'action' : action,
            'response' : {},
            'isSelected' : false
        };

        $scope.activityFeed.push(s3Data);
        $scope.$digest();
    }

    function buildInitialRequest(req) {

        req.content.date = req.date;

        var data = {
            'id' : req.id,
            'type' : $scope.TrafficType,
            'request' : req.content,
            'proxied' : req.proxied,
            'response' : null,
            'isSelected' : false
        };

        $scope.activityFeed.push(data);
        $scope.$digest();
    }

    function amendActivityFeedWithBlockedResponse(data) {

        for (var i=0; i < $scope.activityFeed.length; i++) {
            if ($scope.activityFeed[i].id == data.id) {

                $scope.activityFeed[i].amendedResponse = {
                    'traceId' : data.id,
                    'status' : data.content.status,
                    'body' : data.content.body,
                    'headers' : convertMapToKVPList(data.content.headers)
                };

                $scope.$digest();

                break;
            }
        }

    }

    function convertKVPListToMap(headersKvpList) {

        var headersMap = {};

        if (headersKvpList == null || headersKvpList.length == 0) {
            return headersMap;
        }

        for (var h=0; h < headersKvpList.length; h++) {
            headersMap[headersKvpList[h].key] = headersKvpList[h].value;
        }

        return headersMap;
    }

    function convertMapToKVPList(headersMap) {

        var headersList = [];

        if (headersMap == null || headersMap.length == 0) {
            return headersList;
        }

        for (var h in headersMap) {
            headersList.push({
                "key" : h,
                "value" : headersMap[h]
            });
        }

        return headersList;
    }

    function appendResponse(resp) {

        for (var i=0; i < $scope.activityFeed.length; i++) {
            if ($scope.activityFeed[i].id == resp.id) {

                resp.content.date = resp.date;
                $scope.activityFeed[i].response = resp.content;

                if ($scope.activityFeed[i].proxied) {
                    applyProxiedResponseOrigin($scope.activityFeed[i].response);
                }

                $scope.activityFeed[i].amendedResponse = null;

                $scope.$digest();
                break;
            }
        }
    }

    function applyProxiedResponseOrigin(response) {

        response.isMockedResponse = true;
        response.origin = 'Mock Server';

        var responseHeaders = response.headers;

        for (var h in responseHeaders) {
            if (responseHeaders.hasOwnProperty(h)
                    && h == ProxiedDownstreamUrlResponseHeader) {
                response.isMockedResponse = false;
                response.origin = responseHeaders[h];
            }
        }

    }

    function validateAmendedResponseHeadersAreAllPopulated() {

        for (var h=0; h < $scope.selectedFeedData.amendedResponse.headers.length; h++) {
            if (utils.isBlank($scope.selectedFeedData.amendedResponse.headers[h].key)) {
                return false;
            }
        }

        return true;
    }

    function doAmendedResponseHeadersContainDuplicates() {

        var keys = [];

        for (var h=0; h < $scope.selectedFeedData.amendedResponse.headers.length; h++) {

            var key = $scope.selectedFeedData.amendedResponse.headers[h].key;

            if (keys.indexOf(key) > -1) {
                return true;
            }

            keys.push(key);
        }

        return false;
    }

    function doAddNewEndpointInterceptRow() {

        $scope.endpointsToBlock.push({
            "id" : null,
            "method" : null,
            "path" : null
        });
    }


    //
    // Init Page
    $scope.noActivityData = 'Establishing connection...';
    $timeout(doConnectFunc, InitPageTimeoutMillis);

});
