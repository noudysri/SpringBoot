
app.controller('serverProxyMappingsController', function($scope, $location, $uibModal, $uibModalInstance, $http, $timeout, utils, globalVars, restClient, auth, data) {


    //
    // Constants
    var ServerType = data.serverType;
    var AlertTimeoutMillis = globalVars.AlertTimeoutMillis;
    var PathWildcard = "*";

    $scope.RestfulServerType = globalVars.RestfulServerType;
    $scope.readOnly = (auth.isLoggedIn() && !auth.isAdmin());
    var isLoggedIn = auth.isLoggedIn();
    $scope.ActiveStatus = 'ACTIVE';
    $scope.ReactiveStatus = 'REACTIVE';


    //
    // Labels
    var ServerTypeLabel = (ServerType == globalVars.RestfulServerType)?"HTTP":ServerType;
    $scope.proxyMappingsHeading = ServerTypeLabel + ' Proxy Settings';

    $scope.proxyModeLabel = 'Enable Proxy Mode' + ((isLoggedIn) ? ' (global setting, applies to all users)' : '');
    $scope.proxyModeActiveTypeLabel = 'Look for matching MOCK first, if nothing found, then forward request DOWNSTREAM';
    $scope.proxyModeReactiveTypeLabel = 'Forward request DOWNSTREAM first, if nothing found, then look for a matching MOCK';
    $scope.activeProxy404MockDoNotForwardLabel = 'Do not forward to downstream when 404 is a deliberate mock response';
    $scope.pathUrlMappingsLabel = 'Path to URL Mappings';
    $scope.pathLabel = 'Path';
    $scope.proxyForwardUrlLabel = 'Downstream URL';
    $scope.pathPlaceholderTxt = 'Enter path... (e.g. /v1/products)';
    $scope.proxyForwardPlaceholderTxt = '(e.g http://localhost:9000)';
    $scope.defaultProxyForwardPlaceholderTxt = 'Enter default downstream url...' + $scope.proxyForwardPlaceholderTxt;
    $scope.proxyForwardUrlPlaceholderTxt = 'Enter a downstream url...' + $scope.proxyForwardPlaceholderTxt;;
    $scope.removeMappingRowButtonLabel = 'X';
    $scope.addMappingRowButtonLabel = 'New Row';
    $scope.importLabel = 'Import';
    $scope.exportLabel = 'Export';


    //
    // Buttons
    $scope.cancelButtonLabel = 'Cancel';
    $scope.saveButtonLabel = 'Update Proxy Config';


    //
    // Alerts
    $scope.alerts = [];

    var closeAlertFunc = function() {
        $scope.alerts = [];
    };

   function showAlert(msg, type) {

        if (type == null) {
            type = 'danger';
        }

        $scope.alerts = [];
        $scope.alerts.push({ "type" : type, "msg" : msg });

        $timeout(closeAlertFunc, AlertTimeoutMillis);
    }

    $scope.closeAlert = closeAlertFunc;


    //
    // Data Objects
    var currentProxyMode = false;

    $scope.proxyMappingConfig = {
        "proxyMode" : null,
        "proxyModeType" : null,
        "doNotForwardWhen404Mock" : null,
        "proxyForwardMappings" : []
    };


    //
    // Scoped Functions
    $scope.doSetProxyModeType = function(mode) {
        $scope.proxyMappingConfig.proxyModeType = mode;
    };

    $scope.doAddMappingRow = function() {
        $scope.proxyMappingConfig.proxyForwardMappings.push({ "path" : null, "proxyForwardUrl" : null, "disabled" : false });
    };

    $scope.doRemoveMappingRow = function(index) {
        $scope.proxyMappingConfig.proxyForwardMappings.splice(index, 1);
    };

    $scope.doToggleMappingRowStatus = function(path) {
        for (var p=0; p < $scope.proxyMappingConfig.proxyForwardMappings.length; p++) {
            if ($scope.proxyMappingConfig.proxyForwardMappings[p].path == path) {
                $scope.proxyMappingConfig.proxyForwardMappings[p].disabled = !$scope.proxyMappingConfig.proxyForwardMappings[p].disabled;
            }
        }
    };

    $scope.doSaveProxyMappings = function() {

        // Validation
        if ($scope.proxyMappingConfig.proxyMode
                && $scope.proxyMappingConfig.proxyForwardMappings.length > 0) {

            var duplicatePathCheckArray = [];

            for (var i=0; i < $scope.proxyMappingConfig.proxyForwardMappings.length; i++) {

                var path = $scope.proxyMappingConfig.proxyForwardMappings[i].path;
                var proxyForwardUrl = $scope.proxyMappingConfig.proxyForwardMappings[i].proxyForwardUrl;

                if (utils.isBlank(path)) {
                    showAlert("Please ensure the 'Path' is populated in all your 'Path to URL Mappings'");
                    return;
                }

                if (path != PathWildcard && !path.startsWith("/")) {
                    showAlert("The path '" + path + "' requires a forward slash");
                    return;
                }

                if (utils.isBlank(proxyForwardUrl)) {
                    showAlert("Please ensure the 'Downstream URL' is populated in all 'Path to URL Mappings'");
                    return;
                }

                if (!proxyForwardUrl.startsWith("https://")
                            && !proxyForwardUrl.startsWith("http://")) {
                    showAlert("Downstream URL '" + proxyForwardUrl + "' is not valid");
                    return;
                }

                if (duplicatePathCheckArray.indexOf(path) > -1) {
                    showAlert("The path '" + path + "' is duplicated in your 'Path to URL Mappings'");
                    return;
                }

                duplicatePathCheckArray.push(path);
            }

        }

        var req = {
            "proxyModeType" : $scope.proxyMappingConfig.proxyModeType,
            "doNotForwardWhen404Mock" : $scope.proxyMappingConfig.doNotForwardWhen404Mock,
            "proxyForwardMappings" : $scope.proxyMappingConfig.proxyForwardMappings
        }

        // Send update
        restClient.doPost($http, '/mockedserver/config/' + ServerType + '/user/proxy', req, function(status, data) {

            if (status == 200) {

                // Update the proxy mode if this has been changed and the user is an admin.
                if (!$scope.readOnly
                        && currentProxyMode != $scope.proxyMappingConfig.proxyMode) {
                    doToggleProxyMode($scope.proxyMappingConfig.proxyMode);
                    return;
                }

                $uibModalInstance.close();

                return;
            }

            showAlert(globalVars.GeneralErrorMessage);
        });

    };

    function doToggleProxyMode(enableProxyMode) {

        // Send update
        restClient.doPut($http, '/mockedserver/config/' + ServerType + '/proxy/mode?enableProxyMode=' + enableProxyMode, {}, function(status, data) {

            if (status == 204) {
                $uibModalInstance.close();
                return;
            }

            showAlert(globalVars.GeneralErrorMessage);
        });

    }

    $scope.isBlank = function(input) {
        return utils.isBlank(input);
    }

    $scope.doCancel = function() {
        $uibModalInstance.dismiss('cancel');
    };

    $scope.doImportProxyMappings = function() {

        var modalInstance = $uibModal.open({
            templateUrl: 'server_proxy_mappings_import.html',
            controller: 'serverProxyMappingsImportController',
            backdrop  : 'static',
            keyboard  : false
        });

        modalInstance.result.then(function (response) {

            if (response != null
                    && response.uploadCompleted != null
                    && response.uploadCompleted) {

                utils.checkRestServerStatus(function(running, port) {

                    if (running != null && running) {

                        $uibModalInstance.close();

                    } else {

                        showAlert("Proxy Path to URL mappings updated", "success");
                        loadProxyConfig();
                    }

                });



            }

        }, function () {
        });

    };

    $scope.doExportProxyMappings= function() {

        if ($scope.proxyMappingConfig.proxyForwardMappings.length == 0) {
            return;
        }

        utils.openWarningConfirmation("Export all Path to URL mappings?", function (alertResponse) {

            if (alertResponse) {

                restClient.doGet($http, '/mockedserver/config/' + ServerType + '/proxy/mappings/export', function(status, data) {

                    if (status == 202) {
                        showAlert("No proxy mappings were found to export");
                        return;
                    } else if (status != 200) {
                        showAlert(globalVars.GeneralErrorMessage);
                        return;
                    }

                    utils.handleExportDownload(data, "smockin_proxy_mappings_export.json", "application/json");

                });

            }

        });

    };


    //
    // Internal Functions
    function loadProxyConfig() {

        restClient.doGet($http, '/mockedserver/config/' + ServerType + '/user/proxy', function(status, data) {

            // Always expect server config to be present.
            if (status == 200) {

                currentProxyMode = data.proxyMode;

                $scope.proxyMappingConfig = {
                    "proxyMode" : data.proxyMode,
                    "proxyModeType" : data.proxyModeType,
                    "doNotForwardWhen404Mock" : data.doNotForwardWhen404Mock,
                    "proxyForwardMappings" : data.proxyForwardMappings
                };

                return;
            }

            showAlert(globalVars.GeneralErrorMessage);
        });

    }


    //
    // Init page
    loadProxyConfig();

});
