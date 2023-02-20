
app.controller('dashboardController', function($scope, $location, $routeParams, $timeout, globalVars) {

    //
    // Constants
    $scope.httpServerMode = globalVars.HttpServerMode;
    $scope.s3ServerMode = globalVars.S3ServerMode;
    $scope.mailServerMode = globalVars.MailServerMode;


    //
    // Alerts
    $scope.alerts = [];

    var closeAlertFunc = function() {
        $scope.alerts = [];
    };

    $scope.showAlert = function(msg, type) {

        if (type == null) {
            type = 'danger';
        }

        $scope.alerts = [];
        $scope.alerts.push({ "type" : type, "msg" : msg });

        $timeout(closeAlertFunc, globalVars.AlertTimeoutMillis);
    }

    $scope.closeAlert = closeAlertFunc;


    //
    // Data
    $scope.currentServerModeView = globalVars.HttpServerMode;


    //
    // Check dashboard view
    var dashboardView = $location.search()["dv"];

    if (dashboardView != null) {
        $scope.currentServerModeView = dashboardView;
    }

});
