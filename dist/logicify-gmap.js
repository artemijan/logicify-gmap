/**
 * Created by artem on 5/28/15.
 */
(function (angular) {
    'use strict';
    angular.module('LogicifyGMap',[]);
})(angular);
/**
 * Created by artem on 6/24/15.
 */
(function (angular) {
    'use strict';
    /**
     * Note that if you want custom X button for info window you need to add css
     * .gm-style-iw+div{ display:none }
     * where .gm-style-iw is a class of container element, and next div is close button
     */
    angular.module('LogicifyGMap')
        .directive('logicifyGmapControl',
        [
            '$compile',
            '$log',
            '$timeout',
            function ($compile, $log, $timeout) {
                return {
                    restrict: 'E',
                    require: '^logicifyGmap',
                    link: function (scope, iElement, iAttrs, ctrl) {
                        /*global google*/
                        var position = scope.$eval(iAttrs['controlPosition']);
                        var index = scope.$eval(iAttrs['controlIndex']);
                        var events = scope.$eval(iAttrs['events']);
                        var element = angular.element(iElement.html().trim());
                        $compile(element)(scope);
                        $timeout(function () {
                            scope.$apply();
                        });
                        function attachListener(eventName, callback) {
                            google.maps.event.addDomListener(element[0], eventName, function () {
                                var args = arguments;
                                var self = this;
                                //wrap in timeout to run new digest
                                $timeout(function () {
                                    callback.apply(self, args);
                                });
                            });
                        }

                        element[0].index = index || 0;
                        iElement.html('');
                        ctrl.$mapReady(function (map) {
                            if (!map.controls[position]) {
                                throw new Error('Position of control on the map is invalid. Please see google maps spec.');
                            }
                            map.controls[position].push(element[0]);
                            if (events != null) {
                                angular.forEach(events, function (value, key) {
                                    if (typeof value === 'function') {
                                        attachListener(key, value);
                                    }
                                });
                            }
                        });

                    }
                }
            }
        ]);
})(angular);

/**
 * Created by artem on 5/28/15.
 */
(function (angular) {
    'use strict';
    /**
     * Note that if you want custom X button for info window you need to add css
     * .gm-style-iw+div{ display:none }
     * where .gm-style-iw is a class of container element, and next div is close button
     */
    angular.module('LogicifyGMap')
        .directive('logicifyGmap',
        [
            '$compile',
            '$log',
            '$timeout',
            function ($compile, $log, $timeout) {
                return {
                    restrict: 'E',
                    controller: function () {
                        var self = this;
                        var callbackHolders = [];
                        self.$mapReady = function (callback) {
                            if (callback && self.map) {
                                callback(self.map)
                                return;
                            }
                            if (typeof callback === 'function') {
                                callbackHolders.push(callback);
                            }
                        };
                        self.$setTheMap = function (map) {
                            //resolve all callbacks
                            for (var i = 0; i < callbackHolders.length; i++) {
                                callbackHolders[i](map);
                            }
                            callbackHolders = [];
                            self.map = map;
                        };
                        return self;
                    },
                    link: function (scope, iElement, iAttrs, ctrl) {
                        /*global google*/
                        if (typeof google === 'undefined') {
                            $log.error('There is no google maps lib. Please check that you load it before angular.js');
                            return;
                        }
                        var gmScope = scope.$new();
                        var options = gmScope.$eval(iAttrs['gmOptions']);
                        var readyCallback = gmScope.$eval(iAttrs['gmReady']);
                        var defaultOptions = {
                            zoom: 8,
                            center: new google.maps.LatLng(-34.397, 150.644)
                        };
                        var cssOpts = gmScope.$eval(iAttrs['cssOptions']);
                        options = options || {};
                        var defaultCssOptions = {
                            height: '100%',
                            width: '100%',
                            position: 'absolute'
                        };
                        angular.extend(defaultCssOptions, cssOpts);
                        angular.extend(defaultOptions, options);
                        iElement.css(defaultCssOptions);
                        var div = angular.element('<div>');
                        div.css({
                            height: '100%',
                            width: '100%',
                            margin: 0,
                            padding: 0
                        });
                        iElement.append(div);
                        var map = new google.maps.Map(div[0], defaultOptions);
                        if (typeof readyCallback === 'function') {
                            readyCallback(map);
                        }
                        map.openInfoWnd = function (content, map, marker, infoWindow, overrideOpen) {
                            overrideOpen.apply(infoWindow, [map, marker]);
                            if (infoWindow.$scope && infoWindow.$compiled) {
                                //update scope when info window reopened
                                $timeout(function () {
                                    infoWindow.$scope.$apply();
                                });
                            } else {
                                var childScope = gmScope.$new();
                                childScope.$infoWND = infoWindow;
                                infoWindow.$scope = childScope;
                                $timeout(function () {
                                    childScope.$apply();
                                });
                            }
                            //check if we already compiled template then don't need to do it again
                            if (infoWindow.$compiled !== true) {
                                var compiled = $compile(content.trim())(infoWindow.$scope);
                                infoWindow.$compiled = true;
                                infoWindow.setContent(compiled[0]);
                            }
                        };
                        map.closeInfoWnd = function (infoWnd, overrideCloseMethod) {
                            if (infoWnd.$scope) {
                                infoWnd.$compiled = false;
                                infoWnd.$scope.$destroy();
                                delete infoWnd.$scope;
                                delete infoWnd.$compiled;
                            }
                            overrideCloseMethod.apply(infoWnd, []);
                        };
                        //push map to controller
                        ctrl.$setTheMap(map);
                    }
                }
            }
        ]);
})(angular);

/**
 * Created by artem on 10/7/15.
 */
(function (angular, geoXML3) {
    'use strict';
    angular.module('LogicifyGMap')
        .directive('xmlOverlays', [
            '$timeout',
            '$log',
            '$q',
            '$compile',
            '$http',
            function ($timeout, $log, $q, $compile, $http) {
                return {
                    restrict: 'E',
                    require: '^logicifyGmap',
                    link: function (scope, element, attrs, ctrl) {
                        var geoXml3Parser = null;
                        scope.kmlCollection = scope.$eval(attrs['kmlCollection']) || [];
                        scope.events = scope.$eval(attrs['gmapEvents']) || {};
                        scope.parserOptions = scope.$eval(attrs['parserOptions']) || {};
                        scope.onProgress = scope.$eval(attrs['onProgress']);
                        scope.infowindow = scope.$eval(attrs['infoWindow']);
                        scope.fitBoundsAfterAll = scope.$eval(attrs['fitAllLayers']); //true by default

                        function getParserOptions(map) {
                            var opts = {};
                            angular.extend(opts, scope.parserOptions);
                            //override options
                            opts.map = map;
                            opts.afterParse = afterParse;
                            opts.onAfterCreateGroundOverlay = scope.events.onAfterCreateGroundOverlay;
                            opts.onAfterCreatePolygon = scope.events.onAfterCreatePolygon;
                            opts.onAfterCreatePolyLine = scope.events.onAfterCreatePolyLine;
                            opts.failedParse = failedParse;
                            opts.infoWindow = scope.infowindow;
                            return opts;
                        }

                        ctrl.$mapReady(function (map) {
                            scope.collectionsWatcher = attachCollectionWatcher();
                            scope.gMap = map;
                            geoXml3Parser = new geoXML3.parser(getParserOptions(map));
                            //initKmlCollection();
                        });
                        scope.cancel = false;
                        scope.$on('$destroy', function () {
                            if (typeof scope.collectionsWatcher === 'function') {
                                scope.collectionsWatcher();//cancel watcher
                            }
                        });


                        /**
                         * @return {function()|*} listener
                         */
                        function attachCollectionWatcher() {
                            return scope.$watchCollection('kmlCollection', function (newValue, oldValue) {
                                if (!newValue) {
                                    return;
                                }
                                //if already started
                                if (scope['downLoadingStarted'] === true || scope['parserStarted'] === true) {
                                    scope.cancel = true;
                                }
                                //if need cancel all.
                                if (scope.cancel === true) {
                                    var cancellation = scope.$watch('cancel', function (newValue, oldValue) {
                                        //w8 for finish cancellation
                                        if (newValue === true) {
                                            initKmlCollection();//start init
                                            cancellation();//clear cancel listener
                                        }
                                    });
                                } else {
                                    initKmlCollection();
                                }
                            }, true);
                        }

                        function afterParse(doc) {
                            if (scope.cancel === true) {
                                //cancel to next digest
                                $timeout(function () {
                                    scope.cancel = false;
                                });
                                return false;
                            }
                            doc[0].$uid = new Date().getTime() + '-index-' + scope.currentIndex;
                            scope.kmlCollection[scope.currentIndex].doc = doc;
                            if (typeof scope.events.onAfterParse === 'function') {
                                scope.events.onAfterParse(doc);
                            }
                            whenParserReadyAgain(null, scope.kmlCollection[scope.currentIndex]);
                        }

                        function failedParse() {
                            if (scope.cancel === true) {
                                //cancel to next digest
                                $timeout(function () {
                                    scope.cancel = false;
                                });
                                return false;
                            }
                            var error = {message: 'Failed to parse file #' + scope.currentIndex};
                            $log.error(error.message);
                            if (typeof scope.events.onAfterParseFailed === 'function') {
                                scope.events.onAfterParseFailed(error);
                            }
                            whenParserReadyAgain(error);
                        }

                        function whenParserReadyAgain(error, kmlObject) {
                            setValue('parserStarted', false, progress);
                            if (kmlObject) {
                                //extend bounds
                                if (scope.globalBounds == null) {
                                    scope.globalBounds = new google.maps.LatLngBounds();
                                    scope.globalBounds.extend(kmlObject.doc[0].bounds.getCenter());
                                } else {
                                    scope.globalBounds.extend(kmlObject.doc[0].bounds.getCenter())
                                }
                            }
                            if (scope.currentIndex === scope.kmlCollection.length - 1 && scope.fitBoundsAfterAll !== false) {
                                //if it's last file then
                                $timeout(function () {
                                    scope.gMap.setCenter(scope.globalBounds.getCenter());
                                });
                            } else {
                                //download next file
                                scope.currentIndex++;
                                downLoadOverlayFile(scope.kmlCollection[scope.currentIndex]);
                            }
                        }

                        /**
                         * Is needed for automation "onProgress", calling each time when downloading\parsing finished or started
                         * @param name - could be "downloadingStarted" or "parseStarted"
                         * @param value - boolean
                         * @param callProgress - if exist then call it (since it's users callback)
                         */
                        function setValue(name, value, callProgress) {
                            scope[name] = value;
                            if (typeof callProgress === 'function') {
                                callProgress();
                            }
                        }

                        function clearAll() {
                            angular.forEach(geoXml3Parser.docs, function (doc) {
                                geoXml3Parser.hideDocument(doc);
                            });
                            geoXml3Parser.docs.splice(0, geoXml3Parser.length);
                            geoXml3Parser.docsByUrl = {};
                            scope.globalBounds = null;
                            scope.currentIndex = 0;
                        }

                        /**
                         * Download all files by asset
                         */
                        function initKmlCollection() {
                            if (!Array.isArray(scope.kmlCollection) || scope.kmlCollection.length === 0) {
                                scope.currentIndex = -1;
                            } else {
                                scope['finished'] = false;
                                //if not first init then clear
                                if (scope.currentIndex != null) {
                                    clearAll();
                                } else {
                                    scope.currentIndex = 0;
                                }
                                //start downloading kml collection
                                downLoadOverlayFile(scope.kmlCollection[scope.currentIndex]);
                            }
                        }

                        /**
                         * Each time when "downLoadingStarted" or "parserStarted" changes we are calling this callback
                         */
                        function progress() {
                            if (typeof scope.onProgress === 'function') {
                                scope.onProgress({
                                    isDownloading: scope['downLoadingStarted'],
                                    isParsing: scope['parserStarted'],
                                    finished: scope['finished']
                                });
                            }
                        }

                        function downLoadOverlayFile(kmlObject) {
                            if (!kmlObject) {
                                setValue('finished', true, progress);
                                return;
                            }
                            if (scope.cancel === true) {
                                //cancel to next digest
                                $timeout(function () {
                                    scope.cancel = false;
                                });
                                return false;
                            }
                            setValue('downLoadingStarted', true, progress);
                            if (kmlObject.url != null) {
                                $http.get(kmlObject.url, {responseType: "arraybuffer"})
                                    .then(function (response) {
                                        var data = new Blob([response.data], {type: response.headers()['content-type']});
                                        data.lastModifiedDate = new Date();
                                        data.name = 'example' + data.lastModifiedDate;
                                        onAfterDownload(data);
                                    });

                            } else if (typeof kmlObject.content === 'String') {
                                onAfterDownload(null, kmlObject.content);
                            } else {
                                if (kmlObject instanceof Blob) {
                                    onAfterDownload(kmlObject);
                                } else {
                                    $log.error('Incorrect file type. Should be an instance of a Blob or String (url).');
                                }
                            }
                        }

                        function onAfterDownload(blob, content) {
                            if (scope.cancel === true) {
                                //cancel to next digest
                                $timeout(function () {
                                    scope.cancel = false;
                                });
                                return false;
                            }
                            setValue('parserStarted', true);
                            setValue('downLoadingStarted', false, progress);
                            content == null ? geoXml3Parser.parse(blob) : geoXml3Parser.parseKmlString(content);
                        }
                    }
                }
            }
        ]);
})(angular, geoXML3);
/**
 * Created by artem on 6/18/15.
 */
(function (angular) {
    /*global google*/
    angular.module('LogicifyGMap')
        .service('InfoWindow', ['$log', '$rootScope', '$templateCache', '$timeout', '$http', '$compile', function ($log, $rootScope, $templateCache, $timeout, $http, $compile) {
            function InfoWindow() {
                if (!google) {
                    $log.error('Google maps lib is not found. Please check that you load it before angular.');
                    return;
                }
                var self = this;
                //private
                var readyCallbackHolders = [], isInfoWndReady = false, lastMap = null;
                //public
                self['$ready'] = function (callback) {
                    if (isInfoWndReady === true && callback) {
                        callback(self);
                        return;
                    }
                    if (callback) {
                        readyCallbackHolders.push(callback);
                    }
                };

                //base logic function
                function overridesMethods(content) {
                    //override method 'open'
                    var overrideOpen = self['open'];
                    self['open'] = function (map, marker) {
                        lastMap = map;
                        if (typeof map.openInfoWnd === 'function') {
                            map.openInfoWnd(content, map, marker, self, overrideOpen);
                        }
                    };
                    //override method 'close'
                    var overrideClose = self['close'];
                    self['close'] = function (destroyScope) {
                        if (!lastMap) {
                            $log.error('Info window is closed now, you can not close it twice!');
                            return;
                        }
                        if (typeof lastMap.closeInfoWnd === 'function' && destroyScope === true) {
                            lastMap.closeInfoWnd(self, overrideClose);
                        } else {
                            overrideClose.apply(self, []);
                        }
                    };
                    //notify all registered listeners that info window is ready
                    isInfoWndReady = true;
                    if (readyCallbackHolders.length > 0) {
                        for (var i = 0; i < readyCallbackHolders.length; i++) {
                            readyCallbackHolders[i](self);
                        }
                        readyCallbackHolders = [];
                    }
                }

                //if arguments
                if (arguments[0]) {
                    //select logic if info window creates via template url
                    if (arguments[0].templateUrl) {
                        $http.get(arguments[0].templateUrl, {cache: $templateCache})
                            .then(function (response) {
                                arguments[0].content = response.data;
                                google.maps.InfoWindow.apply(self, arguments);
                                overridesMethods(response.data);
                            });
                    } else if (arguments[0].content) {
                        //if via 'content'
                        google.maps.InfoWindow.apply(self, arguments);
                        overridesMethods(arguments[0].content);
                    }
                } else {
                    //if no args then just call parent constructor, because we can't handle it
                    google.maps.InfoWindow.apply(self, arguments);
                }
            }

            if (google) {
                InfoWindow.prototype = Object.create(google.maps.InfoWindow.prototype);
                InfoWindow.prototype.constructor = InfoWindow;
            }
            return InfoWindow;
        }])
})(angular);