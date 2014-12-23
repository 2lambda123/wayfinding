/*global document*/
/*jslint devel: true, browser: true, windows: true, plusplus: true, maxerr: 50, indent: 4 */

/**
 * @preserve
 * Wayfinding v0.4.1
 * https://github.com/ucdavis/wayfinding
 *
 * Copyright (c) 2010-2014 University of California Regents
 * Licensed under GNU General Public License v2
 * http://www.gnu.org/licenses/old-licenses/gpl-2.0.html
 *
 * Date: 2014-12-02
 *
 */

//  <![CDATA[

(function ($) {
	'use strict';

	var defaults = {
		// the maps collection defaults to a local file called floorplan.svg
		'maps': [{'path': 'floorplan.svg', 'id': 'map.1'}],
		// Path formatting
		'path': {
			color: 'red', // the color of the solution path that will be drawn
			radius: 10, // the radius in pixels to apply to the solution path
			speed: 8, // the speed at which the solution path with be drawn
			width: 3 // the width of the solution path in pixels
		},
		// The door identifier for the default starting point
		'startpoint': function () {
			return 'startpoint';
		},
		// If specified in the wayfinding initialization
		// route to this point as soon as the maps load. Can be initialized
		// as a function or a string (for consistency with startpoint)
		'endpoint': false,
		// Controls routing through stairs
		// if true return an accessible route
		// if false return the shortest route possible
		'accessibleRoute': false,
		// Provides the identifier for the map that should be show at startup,
		// if not given will default to showing first map in the array
		'defaultMap': function () {
			return 'map.1';
		},
		'loadMessage': 'Loading',
		// should dataStoreCache should be used
		// null is cache should not be used
		// string representing url if it should be used
		// object if cache is being passed
		'dataStoreCache': null,
		// if dataStoreCache is string, this is string
		// of url to accessible cache
		'accessibleDataStoreCache': null,
		// place marker for "you are here"
		'showLocation': false,
		//styling for the "you are here pin"
		'locationIndicator': {
			fill: 'red',
			height: 40
		},
		'pinchToZoom': false, // requires jquery.panzoom
		'zoomToRoute': true,
		'zoomPadding': 25,
		// milliseconds to wait during animation when a floor change occurs
		'floorChangeAnimationDelay': 1250
	},
	dataStore;

	$.fn.wayfinding = function (action, options, callback) {
		var passed = options,
			obj, // the jQuery object being worked with;
			maps, // the array of maps populated from options each time
			defaultMap, // the floor to show at start propulated from options
			startpoint, // the result of either the options.startpoint value or the value of the function
			accessible = false,
			// dataStore = null,
			portalSegments = [], // used to store portal pieces until the portals are assembled, then this is dumped. This got moved to datastore
			solution,
			result, // used to return non jQuery results
			drawing;

		// to handle jQuery selecting ids with periods and other special characters
		function escapeSelector(sel) {
			return sel.replace(/(:|\.|\[|\])/g, '\\$1');
		}

		// Applies linear interpolation to find the correct value
		// for traveling from value oldValue to newValue taking into account
		// that you are (i / steps) of the way through the process
		function interpolateValue(oldValue, newValue, i, steps) {
			return (((steps - i) / steps) * oldValue) + ((i / steps) * newValue);
		}

		function CheckMapEmpty(value) {
			this.value = value;
			this.message = ' no maps identified in collection to load';
			this.toString = function() {
				return this.value + this.message;
			};
		}

		function CheckMapDuplicates(value) {
			this.value = value;
			this.message = ' has duplicate map ids';
			this.toString = function() {
				return this.value + this.message;
			};
		}

		function CheckMapBadDefault(value) {
			this.value = value;
			this.message = ' wasn\'t in the list of maps';
			this.toString = function() {
				return this.value + this.message;
			};
		}

		// Ensure floor ids are unique.
		function checkIds(el) {
			var mapNum,
				checkNum,
				reassign = false,
				defaultMapValid = false,
				status;

console.log('checkIds');

			status = $(el).find('div')
				.hide()
				.end()
				.append('<div id="WayfindingStatus" style="">' + options.loadMessage + '</div>');

			if (maps.length > 0) {
				for (mapNum = 0; mapNum < maps.length; mapNum++) {
					for (checkNum = mapNum; checkNum < maps.length; checkNum++) {
						if (mapNum !== checkNum && maps[mapNum].id === maps[checkNum].id) {
							reassign = true;
						}
					}
				}
				if (reassign === true) {
					$(status).text(options.errorMessage);
					throw new CheckMapDuplicates(JSON.stringify(maps));
				}

				//check that defaultMap is valid as well
				for (mapNum = 0; mapNum < maps.length; mapNum++) {
					if (maps[mapNum].id === defaultMap) {
						defaultMapValid = true;
					}
				}
				if (defaultMapValid === false) {
					$(status).text(options.errorMessage);
					throw new CheckMapBadDefault(defaultMap);
				}
			} else {
				// raise exception about no maps being found
				$(status).text(options.errorMessage);
				throw new CheckMapEmpty(JSON.stringify(maps));
			}
		} //function checkIds

		//Takes x and y coordinates and makes a location indicating pin for those
		//coordinates. Returns the pin element, not yet attached to the DOM.
		function makePin(x, y, type) {
			var indicator,
				pin,
				circle,
				height = options.locationIndicator.height, // add error checking?
				symbolPath;

console.log('makePin', x, y, type);

			indicator = document.createElementNS('http://www.w3.org/2000/svg', 'g');

			$(indicator).attr('class', type);

			pin = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');

			symbolPath = 'M0.075,0';
			symbolPath += 'c-2.079-10.207-5.745-18.703-10.186-26.576c-3.295-5.84-7.111-11.23-10.642-16.894c-1.179-1.891-2.196-3.888-3.327-5.85';
			symbolPath += 'c-2.266-3.924-4.102-8.472-3.984-14.372c0.113-5.766,1.781-10.391,4.186-14.172c3.954-6.219,10.578-11.317,19.465-12.657';
			symbolPath += 'c7.268-1.095,14.08,0.756,18.911,3.58c3.948,2.31,7.005,5.394,9.329,9.027c2.426,3.793,4.096,8.274,4.236,14.12';
			symbolPath += 'c0.072,2.995-0.418,5.769-1.109,8.069c-0.699,2.328-1.823,4.274-2.824,6.353c-1.953,4.06-4.4,7.777-6.857,11.498';
			symbolPath += 'C9.954,-26.789,3.083,-15.486,0.075,0z';

			pin.setAttribute('d', symbolPath);
			pin.setAttribute('fill', '#E81E25');
			pin.setAttribute('stroke', '#000000');
			pin.setAttribute('stroke-width', '3.7');
			pin.setAttribute('stroke-miterlimit', '10');

			circle.setAttribute('cx', '0');
			circle.setAttribute('cy', '-63.757');
			circle.setAttribute('r', '9.834');

			indicator.appendChild(pin);
			indicator.appendChild(circle);

			indicator.setAttribute('transform', 'translate(' + x + ' ' + (y - 10 * (height / 125)) + ') scale(' + height / 125 + ')');

			return indicator;

		} //function makePin

		// Extract data from the svg maps
		function buildDataStore(mapNum, map, el) {
			var path,
				doorId,
				x1,
				y1,
				x2,
				y2,
				matches,
				portal,
				portalId;

console.log('buildDataStore', mapNum, map, el);

			//Paths
			dataStore.paths[mapNum] = [];

			$('#Paths line', el).each(function () {
				path = {};
				path.floor = map.id; // floor_1
				path.mapNum = mapNum; // index of floor in array 1
				path.route = Infinity; //Distance
				path.prior = -1; //Prior node in path that yielded route distance

				path.ax = $(this).attr('x1');
				path.ay = $(this).attr('y1');
				path.doorA = [];
				path.bx = $(this).attr('x2');
				path.by = $(this).attr('y2');
				path.doorB = [];
				path.length = Math.sqrt(Math.pow(path.ax - path.bx, 2) + Math.pow(path.ay - path.by, 2));

				path.connections = []; //other paths
				path.portals = []; // connected portals

				dataStore.paths[mapNum].push(path);
			});

			//Doors and starting points
			//roomId or POI_Id

			$('#Doors line', el).each(function () { // index, line
				x1 = $(this).attr('x1');
				y1 = $(this).attr('y1');
				x2 = $(this).attr('x2');
				y2 = $(this).attr('y2');
				doorId = $(this).attr('id');

				$.each(dataStore.paths[mapNum], function (index, path) {
					if (map.id === path.floor && ((path.ax === x1 && path.ay === y1) || (path.ax === x2 && path.ay === y2))) {
						path.doorA.push(doorId);
					} else if (map.id === path.floor && ((path.bx === x1 && path.by === y1) || (path.bx === x2 && path.by === y2))) {
						path.doorB.push(doorId);
					}
				});

			});

			//Portal Segments -- string theory says unmatched portal segment useless -- no wormhole

			$('#Portals line', el).each(function () { // index, line
				portal = {};

				portalId = $(this).attr('id');

				if (portalId && portalId.indexOf('_') > -1) {
					portalId = portalId.slice(0, portalId.indexOf('_'));
				}

				portal.id = portalId;
				portal.type = portalId.split('.')[0];
				portal.floor = map.id;

				portal.mate = portalId.split('.').slice(0, 2).join('.') + '.' + map.id;

				portal.mapNum = mapNum;

				portal.matched = false;

				x1 = $(this).attr('x1');
				y1 = $(this).attr('y1');
				x2 = $(this).attr('x2');
				y2 = $(this).attr('y2');

				matches = $.grep(dataStore.paths[mapNum], function (n) { // , i
					return ((x1 === n.ax && y1 === n.ay) || (x1 === n.bx && y1 === n.by));
				});

				if (matches.length !== 0) {
					portal.x = x1;
					portal.y = y1;
				} else {
					portal.x = x2;
					portal.y = y2;
				}

				//portal needs length -- long stairs versus elevator
				portal.length = Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2));

				portalSegments.push(portal);
			});
		} // function buildDataStore

		// after data extracted from all svg maps then build portals between them
		function buildPortals(maps) {

			var segmentOuterNum,
				segmentInnerNum,
				outerSegment,
				innerSegment,
				portal,
				mapNum,
				pathOuterNum,
				pathInnerNum,
				portalNum,
				pathNum;

console.log('buildPortals', maps);

			for (segmentOuterNum = 0; segmentOuterNum < portalSegments.length; segmentOuterNum++) {

				outerSegment = portalSegments[segmentOuterNum];

				if (outerSegment.matched === false) {

					for (segmentInnerNum = segmentOuterNum; segmentInnerNum < portalSegments.length; segmentInnerNum++) {
						if (portalSegments[segmentInnerNum].id === outerSegment.mate && portalSegments[segmentInnerNum].mate === outerSegment.id) {
							innerSegment = portalSegments[segmentInnerNum];

							portal = {};

							outerSegment.matched = true;
							innerSegment.matched = true;

							portal.type = outerSegment.type;
							portal.accessible = (portal.type === 'Elev' || portal.type === 'Door') ? true : false; // consider changing to != Stair

							portal.idA = outerSegment.id;
							portal.floorA = outerSegment.floor;
							portal.floorANum = outerSegment.mapNum;
							portal.xA = outerSegment.x;
							portal.yA = outerSegment.y;
							portal.connectionsA = []; //only paths

							portal.idB = innerSegment.id;
							portal.floorB = innerSegment.floor;
							portal.floorBNum = innerSegment.mapNum;
							portal.xB = innerSegment.x;
							portal.yB = innerSegment.y;
							portal.connectionsB = []; // only paths

							portal.length = outerSegment.length + innerSegment.length;

							portal.route = Infinity;
							portal.prior = -1;

							dataStore.portals.push(portal);

						}
					}
				}
			}

			//check each path for connections to other paths
			//checks only possible matchs on same floor, and only for half-1 triangle of search area to speed up search
			for (mapNum = 0; mapNum < maps.length; mapNum++) {
				for (pathOuterNum = 0; pathOuterNum < dataStore.paths[mapNum].length - 1; pathOuterNum++) {
					for (pathInnerNum = pathOuterNum + 1; pathInnerNum < dataStore.paths[mapNum].length; pathInnerNum++) {
						if (
							(dataStore.paths[mapNum][pathInnerNum].ax === dataStore.paths[mapNum][pathOuterNum].ax &&
							dataStore.paths[mapNum][pathInnerNum].ay === dataStore.paths[mapNum][pathOuterNum].ay) ||
								(dataStore.paths[mapNum][pathInnerNum].bx === dataStore.paths[mapNum][pathOuterNum].ax &&
									dataStore.paths[mapNum][pathInnerNum].by === dataStore.paths[mapNum][pathOuterNum].ay) ||
								(dataStore.paths[mapNum][pathInnerNum].ax === dataStore.paths[mapNum][pathOuterNum].bx &&
									dataStore.paths[mapNum][pathInnerNum].ay === dataStore.paths[mapNum][pathOuterNum].by) ||
								(dataStore.paths[mapNum][pathInnerNum].bx === dataStore.paths[mapNum][pathOuterNum].bx &&
									dataStore.paths[mapNum][pathInnerNum].by === dataStore.paths[mapNum][pathOuterNum].by)
						) {
							dataStore.paths[mapNum][pathOuterNum].connections.push(pathInnerNum);
							dataStore.paths[mapNum][pathInnerNum].connections.push(pathOuterNum);
						}
					}
				}
			}

			//optimize portal searching of paths
			for (portalNum = 0; portalNum < dataStore.portals.length; portalNum++) {
				for (mapNum = 0; mapNum < maps.length; mapNum++) {
					for (pathNum = 0; pathNum < dataStore.paths[mapNum].length; pathNum++) {
						if (dataStore.portals[portalNum].floorA === dataStore.paths[mapNum][pathNum].floor &&
								((dataStore.portals[portalNum].xA === dataStore.paths[mapNum][pathNum].ax &&
									dataStore.portals[portalNum].yA === dataStore.paths[mapNum][pathNum].ay) ||
									(dataStore.portals[portalNum].xA === dataStore.paths[mapNum][pathNum].bx &&
										dataStore.portals[portalNum].yA === dataStore.paths[mapNum][pathNum].by))) {
							dataStore.portals[portalNum].connectionsA.push(pathNum);
							dataStore.paths[mapNum][pathNum].portals.push(portalNum);
						} else if (dataStore.portals[portalNum].floorB === dataStore.paths[mapNum][pathNum].floor &&
								((dataStore.portals[portalNum].xB === dataStore.paths[mapNum][pathNum].ax &&
									dataStore.portals[portalNum].yB === dataStore.paths[mapNum][pathNum].ay) ||
								(dataStore.portals[portalNum].xB === dataStore.paths[mapNum][pathNum].bx &&
									dataStore.portals[portalNum].yB === dataStore.paths[mapNum][pathNum].by))) {
							dataStore.portals[portalNum].connectionsB.push(pathNum);
							dataStore.paths[mapNum][pathNum].portals.push(portalNum);
						}
					}
				}
			}

			portalSegments = [];

		} // end function buildportals

		//get the set of paths adjacent to a door or endpoint.
		function getDoorPaths(maps, door) {
			var mapNum,
				pathNum,
				doorANum,
				doorBNum,
				doorPaths = {
					'paths': [],
					'floor': null
				};

console.log('getDoorPaths', maps, door);

			for (mapNum = 0; mapNum < maps.length; mapNum++) {
				for (pathNum = 0; pathNum < dataStore.paths[mapNum].length; pathNum++) {
					for (doorANum = 0; doorANum < dataStore.paths[mapNum][pathNum].doorA.length; doorANum++) {
						if (dataStore.paths[mapNum][pathNum].doorA[doorANum] === door) {
							doorPaths.paths.push(pathNum); // only pushing pathNum because starting on a single floor
							doorPaths.floor = dataStore.paths[mapNum][pathNum].floor;
						}
					}
					for (doorBNum = 0; doorBNum < dataStore.paths[mapNum][pathNum].doorB.length; doorBNum++) {
						if (dataStore.paths[mapNum][pathNum].doorB[doorBNum] === door) {
							doorPaths.paths.push(pathNum); // only pushing pathNum because starting on a single floor
							doorPaths.floor = dataStore.paths[mapNum][pathNum].floor;
						}
					}
				}
			}
			return doorPaths;
		}

		function recursiveSearch(segmentType, segmentFloor, segment, length) {
			//SegmentType is PAth or POrtal, segment floor limits search, segment is id per type and floor, length is total length of current thread
			// for each path on this floor look at all the paths we know connect to it

// console.log('recursiveSearch', segmentType, segmentFloor, segment, length);

			$.each(dataStore.paths[segmentFloor][segment].connections, function (i, tryPath) {
				// check and see if the current path is a shorter path to the new path
				if (length + dataStore.paths[segmentFloor][tryPath].length < dataStore.paths[segmentFloor][tryPath].route) {
					dataStore.paths[segmentFloor][tryPath].route = length + dataStore.paths[segmentFloor][tryPath].length;
					dataStore.paths[segmentFloor][tryPath].prior = segment;
					dataStore.paths[segmentFloor][tryPath].priorType = segmentType;
					recursiveSearch('pa', segmentFloor,  tryPath, dataStore.paths[segmentFloor][tryPath].route);
				}
			});

			// if the current path is connected to any portals
			if (dataStore.paths[segmentFloor][segment].portals.length > 0) {

// console.log('recursiveSearch', segmentType, segmentFloor, segment, dataStore.paths[segmentFloor][segment].portals);

				// look at each portal, tryPortal is portal index in portals
				$.each(dataStore.paths[segmentFloor][segment].portals, function (i, tryPortal) {

// console.log('tryPortal', length, dataStore.portals[tryPortal].length, dataStore.portals[tryPortal].route, accessible);

					if (length + dataStore.portals[tryPortal].length < dataStore.portals[tryPortal].route && (accessible === false || (accessible === true && dataStore.portals[tryPortal].accessible))) {
						dataStore.portals[tryPortal].route = length + dataStore.portals[tryPortal].length;
						dataStore.portals[tryPortal].prior = segment;
						dataStore.portals[tryPortal].priormapNum = dataStore.paths[segmentFloor][segment].mapNum;
						dataStore.portals[tryPortal].priorType = segmentType;

// console.log('following!');

						// if the incoming segment to the portal is at one end of the portal try all the paths at the other end
						if ($.inArray(segment, dataStore.portals[tryPortal].connectionsA) !== -1) {
							$.each(dataStore.portals[tryPortal].connectionsB, function (i, tryPath) {
								//if adding this path
								if (length + dataStore.portals[tryPortal].length + dataStore.paths[dataStore.portals[tryPortal].floorBNum][tryPath].length < dataStore.paths[dataStore.portals[tryPortal].floorBNum][tryPath].route) {
									dataStore.paths[dataStore.portals[tryPortal].floorBNum][tryPath].route = dataStore.portals[tryPortal].route + dataStore.paths[dataStore.portals[tryPortal].floorBNum][tryPath].length;
									dataStore.paths[dataStore.portals[tryPortal].floorBNum][tryPath].prior = tryPortal;
									dataStore.paths[dataStore.portals[tryPortal].floorBNum][tryPath].priorType = 'po';
									recursiveSearch('pa', dataStore.portals[tryPortal].floorBNum, tryPath, dataStore.paths[dataStore.portals[tryPortal].floorBNum][tryPath].route);
								}
							});
						} else {
							$.each(dataStore.portals[tryPortal].connectionsA, function (i, tryPath) {
								// if adding this path
								if (length + dataStore.portals[tryPortal].length + dataStore.paths[dataStore.portals[tryPortal].floorANum][tryPath].length < dataStore.paths[dataStore.portals[tryPortal].floorANum][tryPath].route) {
									dataStore.paths[dataStore.portals[tryPortal].floorANum][tryPath].route = dataStore.portals[tryPortal].route + dataStore.paths[dataStore.portals[tryPortal].floorANum][tryPath].length;
									dataStore.paths[dataStore.portals[tryPortal].floorANum][tryPath].prior = tryPortal;
									dataStore.paths[dataStore.portals[tryPortal].floorANum][tryPath].priorType = 'po';
									recursiveSearch('pa', dataStore.portals[tryPortal].floorANum, tryPath, dataStore.paths[dataStore.portals[tryPortal].floorANum][tryPath].route);
								}
							});
						}
					}
				});
			}
		}


		function generateRoutes(startpoint, maps) {
			var sourceInfo,
				mapNum,
				sourcemapNum;
console.log('generateRoutes',startpoint, maps);

			sourceInfo = getDoorPaths(maps, startpoint);

			for (mapNum = 0; mapNum < maps.length; mapNum++) {
				if (maps[mapNum].id === sourceInfo.floor) {
					sourcemapNum = mapNum;
					break;
				}
			}

			$.each(sourceInfo.paths, function (i, pathId) {
				dataStore.paths[sourcemapNum][pathId].route = dataStore.paths[sourcemapNum][pathId].length;
				dataStore.paths[sourcemapNum][pathId].prior = 'door';
				recursiveSearch('pa', sourcemapNum, pathId, dataStore.paths[sourcemapNum][pathId].length);
			});
		}


		// from a given end point generate an array representing the reverse steps needed to reach destination along shortest path
		function backTrack(segmentType, segmentFloor, segment) {
			var step;

console.log('backTrack', segmentType, segmentFloor, segment);

			// if we aren't at the startpoint point
			if (segment !== 'door') {
				step = {};
				step.type = segmentType;
				step.floor = segmentFloor;
				step.segment = segment;
				solution.push(step);

console.log(step);

				switch (segmentType) {
				case 'pa':
					backTrack(dataStore.paths[segmentFloor][segment].priorType, segmentFloor, dataStore.paths[segmentFloor][segment].prior);
					break;
				case 'po':
					backTrack(dataStore.portals[segment].priorType, dataStore.portals[segment].priormapNum, dataStore.portals[segment].prior);
					break;
				}
			}
		}

		function getShortestRoute(maps, destinations, startpoint) {

console.log('getShortestRoute', maps, destinations, startpoint);

			function minLengthRoute(maps, destination, startpoint) {
				var destInfo,
				mapNum,
				minPath,
				reversePathStart,
				destinationmapNum,
				i;

				destInfo = getDoorPaths(maps, destination);

// console.log('shorty', maps, destination, startpoint, destInfo);

				for (mapNum = 0; mapNum < maps.length; mapNum++) {
					if (maps[mapNum].id === destInfo.floor) {
						destinationmapNum = mapNum;
						break;
					}
				}

				minPath = Infinity;
				reversePathStart = -1;

// console.log('shorty dest', destInfo);

				for (i = 0; i < destInfo.paths.length; i++) {

// console.log('shorty route', dataStore.paths[destinationmapNum][destInfo.paths[i]]);

					if (dataStore.paths[destinationmapNum][destInfo.paths[i]].route < minPath) {
						minPath = dataStore.paths[destinationmapNum][destInfo.paths[i]].route;
						reversePathStart = destInfo.paths[i];
					}
				}

				if (reversePathStart !== -1) {
					solution = []; //can't be set in backtrack because it is recursive.
					backTrack('pa', destinationmapNum, reversePathStart);
					solution.reverse();

// console.log('shorty worked', solution);

					return {
						'startpoint': startpoint,
						'endpoint': destination,
						'solution': solution,
						'distance': minPath
					};
				}

// console.log('shorty sucks');

				return {
					'startpoint': startpoint,
					'endpoint': destination,
					'solution': [],
					'distance': minPath
				};
			}

			if (Array.isArray(destinations)) {
				return $.map(destinations, function (dest) {
					return minLengthRoute(maps, dest, startpoint);
				});
			} else {
				return minLengthRoute(maps, destinations, startpoint);
			}
		}

		// Set the start point, and put a location indicator
		// in that spot, if feature is enabled.
		function setStartPoint(startPoint, el) {
			var start,
				pointName,
				attachPinLocation,
				x,
				y,
				pin;

console.log('setStartPoint', startPoint, el);

			//clears locationIndicators from the maps
			$('g.startPin', el).remove();

			// set startpoint correctly
			if (typeof(startPoint) === 'function') {
				options.startpoint = startPoint();
			} else {
				options.startpoint = startPoint;
			}

			pointName = options.startpoint;

			if (options.showLocation) {

				start = $('#Doors #' + escapeSelector(pointName), el);

				var startMap = el.children().has($('#' + escapeSelector(pointName)));

				attachPinLocation = $('svg', startMap).children().last();

				if (start.length) {
					x = (Number(start.attr('x1')) + Number(start.attr('x2'))) / 2;
					y = (Number(start.attr('y1')) + Number(start.attr('y2'))) / 2;

					pin = makePin(x, y, 'startPin');

					attachPinLocation.after(pin);
				} else {
					return; //start point does not exist
				}
			}
		} //function setStartPoint

		function setEndPoint(endPoint, el) {
			var end,
				attachPinLocation,
				x,
				y,
				pin;

console.log('setEndPoint', endPoint, el);

			//clears locationIndicators from the maps
			$('g.destinationPin', el).remove();

			if (options.showLocation) {
				end = $('#Doors #' + escapeSelector(endPoint), el);

				attachPinLocation = $('svg').has('#Rooms a[id="' + escapeSelector(endPoint) + '"]');
				if (end.length) {
					x = (Number(end.attr('x1')) + Number(end.attr('x2'))) / 2;
					y = (Number(end.attr('y1')) + Number(end.attr('y2'))) / 2;

					pin = makePin(x, y, 'destinationPin');

					attachPinLocation.append(pin);
				} else {
					return; //end point does not exist
				}
			}
		} //function setEndPoint

		// Set options based on either provided options or defaults
		function getOptions(el) {
			var optionsPrior = el.data('wayfinding:options');

console.log('getOptions', el);

			drawing = el.data('wayfinding:drawing'); // load a drawn path, if it exists

			options = $.extend(true, {}, defaults, options);

			// check for settings attached to the current object
			if (optionsPrior !== undefined) {
				options = optionsPrior;
			} else {
				options = $.extend(true, {}, defaults, options);
			}

			// check for settings attached to the current object
			options = $.metadata ? $.extend(true, {}, options, el.metadata()) : options;

			// Create references to the options
			maps = options.maps;

			// set defaultMap correctly, handle both function and value being passed
			if (typeof(options.defaultMap) === 'function') {
				defaultMap = options.defaultMap();
			} else {
				defaultMap = options.defaultMap;
			}

			// Set startpoint correctly
			if (typeof(options.startpoint) === 'function') {
				setStartPoint(options.startpoint(), el);
			} else {
				startpoint = options.startpoint;
			}
		} //function getOptions

		function setOptions(el) {

console.log('setOptions', el);

			el.data('wayfinding:options', options);
			el.data('wayfinding:drawing', drawing);
			// need to handle cases where WayfindingDataStore isn't loaded if we are separating these out
			el.data('wayfinding:data', dataStore);
		}

		function cleanupSVG(el) { // should only be called once instead of twice if initalize and build for non datastore

console.log('cleanupSVG', $(el));

			var svg = $(el).find('svg'),
				height = parseInt($(svg).attr('height').replace('px', '').split('.')[0], 10),
				width = parseInt($(svg).attr('width').replace('px', '').split('.')[0], 10);

console.log($(svg).attr('height'), $(svg).attr('width'));

			// Ensure SVG w/h are divisble by 2 (to avoid webkit blurriness bug on pan/zoom)
			// might need to shift this change to the enclosing element for responsive svgs?
			height = Math.ceil(height / 2) * 2;
			width = Math.ceil(width / 2) * 2;

console.log(height, width);

			// if ($(el).css('padding-bottom') === '' || $(el).css('padding-bottom') === '0px') {
				$(el).css('padding-bottom', (100 * (height / width)) + '%');

				svg.attr('height', '100%')
					.attr('width', '100%')
					.attr('preserveAspectRatio', 'xMinYMin meet');
			// }

			// clean up after illustrator -> svg issues
			$('#Rooms a, #Doors line', el).each(function () {
				if ($(this).prop('id') && $(this).prop('id').indexOf('_') > 0) {
					var oldID = $(this).prop('id');
					$(this).prop('id', oldID.slice(0, oldID.indexOf('_')));
				}
			});
		} //function cleanupSVG

		// Ensures '$el' has a valid jQuery.panzoom object
		function initializePanZoom(el) {

console.log('initializePanZoom', el);

			el.panzoom({
				minScale: 1.0,
				contain: 'invert',
				cursor: 'pointer'
			});

			// Allow clicking on links within the SVG despite $.panZoom()
			el.find('a').on('mousedown touchstart', function(e) {
				e.stopImmediatePropagation();
			});
		} //function initializePanZoom

		// Hide SVG div, hide path lines (they're data, not visuals), make rooms clickable
		function activateSVG(obj, svgDiv) {

console.log('activateSVG', obj, svgDiv);

			// Hide maps until explicitly displayed
			$(svgDiv).hide();

			// Hide route information
			$('#Paths line', svgDiv).attr('stroke-opacity', 0);
			$('#Doors line', svgDiv).attr('stroke-opacity', 0);
			$('#Portals line', svgDiv).attr('stroke-opacity', 0);

			// If #Paths, #Doors, etc. are in a group, ensure that group does _not_
			// have display: none; (commonly set by Illustrator when hiding a layer)
			// and instead add opacity: 0; (which allows for events, unlike display: none;)
			// (A group tag 'g' is used by Illustrator for layers.)
			var $dataGroup = $('#Paths', svgDiv).parent();
			if($dataGroup.is('g')) {
				$dataGroup.attr('opacity', 0).attr('display', 'inline');
			}

			// The following need to use the el variable to scope their calls: el is jquery element

			// Make rooms clickable
			$('#Rooms a', svgDiv).click(function (event) {
				$(obj).trigger('wayfinding:roomClicked', [ { roomId: $(this).attr('id') } ] );
				$(obj).wayfinding('routeTo', $(this).prop('id'));
				event.preventDefault();
			});

			// Disable clicking on every SVG element except rooms
			$(svgDiv).find('*').css('pointer-events', 'none');
			$('#Rooms a', svgDiv).find('*').css('pointer-events', 'auto');

			$(obj).append(svgDiv);

			// jQuery.panzoom() only works after element is attached to DOM
			if(options.pinchToZoom) {
				initializePanZoom($(svgDiv));
			}
		} //function activateSVG

		// Called when animatePath() is switching the floor and also when
		function switchFloor(floor, el) {
			var height = $(el).height();

console.log('switchFloor', floor, el);

			$(el).height(height); // preserve height as I'm not yet set switching

			$('div', el).hide();

			$('#' + floor, el).show(0, function() {
				$(el).trigger('wayfinding:floorChanged', { mapId: floor });
			});

			//turn floor into mapNum, look for that in drawing
			// if there get drawing[level].routeLength and use that.

			var i, level, mapNum, pathLength;

			if (drawing) {
				mapNum = -1;

				for (i = 0; i < maps.length; i++) {
					if (maps[i] === floor) {
						mapNum = i;
						break;
					}
				}

				level = -1;

				for (i = 0; i < drawing.length; i++) {
					if (drawing[i].floor === mapNum) {
						level = i;
						break;
					}
				}

				if (level !== -1) {
					pathLength = drawing[level].routeLength;

					// these next three are potentially redundant now
					$(drawing[level].path, el).attr('stroke-dasharray', [pathLength, pathLength]);
					$(drawing[level].path, el).attr('stroke-dashoffset', pathLength);
					$(drawing[level].path, el).attr('pathLength', pathLength);
					$(drawing[level].path, el).attr('stroke-dashoffset', pathLength);

					$(drawing[level].path, el).animate({svgStrokeDashOffset: 0}, pathLength * options.path.speed); //or move minPath to global variable?
				}
			}
		} //function switchFloor

		function hidePath(obj) {

console.log('hidepath', obj);

			$('path[class^=directionPath]', obj).css({
				'stroke': 'none'
			});
		}

		// Uses jQuery.panzoom to pan/zoom to the SVG viewbox coordinate equivalent of (x, y, w, h)
		function panzoomWithViewBoxCoords(cssDiv, svg, x, y, w, h) {

console.log('panzoomWithViewBoxCoords', cssDiv, svg, x, y, w, h);

			x = parseFloat(x);
			y = parseFloat(y);
			w = parseFloat(w);
			h = parseFloat(h);

			var viewBox = svg.getAttribute('viewBox');
			var viewX = parseFloat(viewBox.split(/\s+|,/)[0]); // viewBox is [x, y, w, h], x == [0]
			var viewY = parseFloat(viewBox.split(/\s+|,/)[1]);
			var viewW = parseFloat(viewBox.split(/\s+|,/)[2]);
			var viewH = parseFloat(viewBox.split(/\s+|,/)[3]);

			var cssW = $(cssDiv).width();
			var cssH = $(cssDiv).height();

			// Step 1, determine the scale
			var scale = Math.min(( viewW / w ), ( viewH / h ));

			$(cssDiv).panzoom('zoom', parseFloat(scale));

			// Determine bounding box -> CSS coordinate conversion factor
			var bcX = cssW / viewW;
			var bcY = cssH / viewH;

			// Step 2, determine the focal
			var bcx = viewX + (viewW / 2); // box center
			var bcy = viewY + (viewH / 2);

			var fx = (bcx - (x + (w / 2))) * bcX;
			var fy = (bcy - (y + (h / 2))) * bcY;

			// Step 3, apply $.panzoom()
			$(cssDiv).panzoom('pan', fx * scale, fy * scale);
		}

		function animatePath(drawing, drawingSegment) {
			var path,
			svg,
			pathRect,
			drawLength,
			oldViewBox,
			animationDuration,
			pad = options.zoomPadding;

console.log('animatePath', drawing, drawingSegment);

			if (1 !== 1 && drawingSegment >= drawing.length) {
				// if repeat is set, then delay and rerun display from first.
				// Don't implement, until we have click to cancel out of this
				setTimeout(function () {
					animatePath(drawing, 0);
				},
				5000);
			} else if (drawingSegment >= drawing.length) {
				//finished, stop recursion.
				return;
			}

			var mapIdx = drawing[drawingSegment][0].floor;
			svg = $('#' + maps[mapIdx].id + ' svg')[0];

			drawLength = drawing[drawingSegment].routeLength;
			animationDuration = drawLength * options.path.speed;

			switchFloor(maps[drawing[drawingSegment][0].floor].id, obj);

			// Get the complete path for this particular floor-route
			path = $('#' + maps[drawing[drawingSegment][0].floor].id + ' .directionPath' + drawingSegment)[0];

			// Animate using CSS transitions
			// SVG animation technique from http://jakearchibald.com/2013/animated-line-drawing-svg/
			path.style.stroke = options.path.color;
			path.style.strokeWidth = options.path.width;
			path.style.transition = path.style.WebkitTransition = 'none';
			path.style.strokeDasharray = drawLength + ' ' + drawLength;
			path.style.strokeDashoffset = drawLength;
			pathRect = path.getBBox();
			path.style.transition = path.style.WebkitTransition = 'stroke-dashoffset ' + animationDuration + 'ms linear';
			path.style.strokeDashoffset = '0';

			// If this is the last segment, trigger the 'wayfinding:animationComplete' event
			// when it finishes drawing.
			// If we're using zoomToRoute however, don't trigger here, trigger when zoomOut is complete (see below)
			if(options.zoomToRoute === false) {
				if(drawingSegment === (drawing.length - 1)) {
					$(path).one('webkitTransitionEnd otransitionend oTransitionEnd msTransitionEnd transitionend', function() {
						$(obj).trigger('wayfinding:animationComplete');
					});
				}
			}

			// Zooming logic...
			var steps = 35;
			var duration = 650; // Zoom animation in milliseconds

			// Store the original SVG viewBox in order to zoom out back to it after path animation
			oldViewBox = svg.getAttribute('viewBox');
			var oldViewX = parseFloat(oldViewBox.split(/\s+|,/)[0]); // viewBox is [x, y, w, h], x == [0]
			var oldViewY = parseFloat(oldViewBox.split(/\s+|,/)[1]);
			var oldViewW = parseFloat(oldViewBox.split(/\s+|,/)[2]);
			var oldViewH = parseFloat(oldViewBox.split(/\s+|,/)[3]);

			// Calculate single step size from each direction
			var newViewX = pathRect.x - pad;
					newViewX = newViewX > 0 ? newViewX : 0;
			var newViewW = pathRect.width + (2 * pad);
			var newViewY = pathRect.y - pad;
					newViewY = newViewY > 0 ? newViewY : 0;
			var newViewH = pathRect.height + (2 * pad);

			if (options.zoomToRoute) {
				// Loop the specified number of steps to create the zoom in animation
				for (var i = 0; i <= steps; i++) {
					(function(i) {
						setTimeout(function() {
							var zoomInX = interpolateValue(oldViewX, newViewX, i, steps);
							var zoomInY = interpolateValue(oldViewY, newViewY, i, steps);
							var zoomInW = interpolateValue(oldViewW, newViewW, i, steps);
							var zoomInH = interpolateValue(oldViewH, newViewH, i, steps);

							if(options.pinchToZoom) {
								// Use CSS 3-based zooming
								panzoomWithViewBoxCoords($(svg).parent()[0], svg, zoomInX, zoomInY, zoomInW, zoomInH);
							} else {
								// Use SVG viewBox-based zooming
								svg.setAttribute('viewBox', zoomInX + ' ' + zoomInY + ' ' + zoomInW + ' ' + zoomInH);
							}
						}, i * (duration / steps));
					}(i));
				}
			}

			// Call animatePath after 'animationDuration' milliseconds to animate the next segment of the path,
			// if any.
			// Note: This is not tiny path 'segments' which form the lines curving around
			//       hallways but rather the other 'paths' needed on other floors, if any.
			setTimeout(function () {
				animatePath(drawing, ++drawingSegment);

				if (options.zoomToRoute) {
					// Loop the specified number of steps to create the zoom out animation
					// or set i = steps to force the zoom out immediately (used on floors
					// no longer visible to the user due to floor changes)
					var i;

					// Animate zoom out if we're on the last drawing segment, else
					// we can just reset the zoom out (improves performance, user will never notice)
					if((drawing.length === 1) || ((drawing.length > 1) && (drawingSegment === drawing.length))) {
						i = 0; // apply full animation
					} else {
						i = steps; // effectively removes animation and resets the zoom out (only triggered on floors where the user
					}

					for ( ; i <= steps; i++) {
						(function(i) {
							setTimeout(function() {
								var zoomOutX = interpolateValue(newViewX, oldViewX, i, steps);
								var zoomOutY = interpolateValue(newViewY, oldViewY, i, steps);
								var zoomOutW = interpolateValue(newViewW, oldViewW, i, steps);
								var zoomOutH = interpolateValue(newViewH, oldViewH, i, steps);

								if(options.pinchToZoom) {
									// Use CSS 3-based zooming
									panzoomWithViewBoxCoords($(svg).parent()[0], svg, zoomOutX, zoomOutY, zoomOutW, zoomOutH);
								} else {
									svg.setAttribute('viewBox', zoomOutX + ' ' + zoomOutY + ' ' + zoomOutW + ' ' + zoomOutH);
								}

								if(i === steps) {
									if(drawingSegment === drawing.length) {
										$(obj).trigger('wayfinding:animationComplete');
									}
								}
							}, i * (duration / steps));
						}(i));
					}
				}
			}, animationDuration + options.floorChangeAnimationDelay);
		} //function animatePath

		// The combined routing function
		// revise to only interate if startpoint has changed since last time?
		function routeTo(destination, el) {
			var i,
				draw,
				stepNum,
				level,
				reversePathStart,
				portalsEntered,
				lastStep,
				ax,
				ay,
				bx,
				by,
				aDX,
				aDY,
				bDX,
				bDY,
				cx,
				cy,
				px,
				py,
				curve,
				nx,
				ny,
				thisPath,
				pick;

console.log('routeTo', destination);

			options.endpoint = destination;

			// remove any prior paths from the current map set
			$('path[class^=directionPath]', obj).remove();

			//clear all rooms
			$('#Rooms *.wayfindingRoom', obj).removeAttr('class');

			solution = [];

			//if startpoint != destination
			if (startpoint !== destination) {
				// get accessibleRoute option -- options.accessibleRoute

				//highlight the destination room
				$('#Rooms a[id="' + destination + '"] g', obj).attr('class', 'wayfindingRoom');
				setEndPoint(options.endpoint, el);

				solution = getShortestRoute(maps, destination, startpoint).solution;

// console.log('routeTo', solution, maps, destination, startpoint);

				if (reversePathStart !== -1) {

					portalsEntered = 0;
					// Count number of portal trips
					for (i = 0; i < solution.length; i++) {
						if (solution[i].type === 'po') {
							portalsEntered++;
						}
					}

					//break this into a new function?
					drawing = new Array(portalsEntered); // Problem at line 707 character 40: Use the array literal notation [].

					drawing[0] = [];

					//build drawing and modify solution for text generation by adding .direction to solution segments?

					draw = {};

					if(solution.length === 0) {
						console.warn('Attempting to route with no solution. This should never happen. SVG likely has errors. Destination is: ' + destination);
						return;
					}

// console.log('solution', solution.length, solution, portalsEntered);
// console.log('startpoint', startpoint, dataStore.paths[solution[0].floor][solution[0].segment]);

					//if statement incorrectly assumes one door at the end of the path, works in that case, need to generalize
					if (dataStore.paths[solution[0].floor][solution[0].segment].doorA[0] === startpoint) {
						draw = {};
						draw.floor = solution[0].floor;
						draw.type = 'M';
						draw.x = dataStore.paths[solution[0].floor][solution[0].segment].ax;
						draw.y = dataStore.paths[solution[0].floor][solution[0].segment].ay;
						draw.length = 0;
						drawing[0].push(draw);
						draw = {};
						draw.type = 'L';
						draw.floor = solution[0].floor;
						draw.x = dataStore.paths[solution[0].floor][solution[0].segment].bx;
						draw.y = dataStore.paths[solution[0].floor][solution[0].segment].by;
						draw.length = dataStore.paths[solution[0].floor][solution[0].segment].length;
						drawing[0].push(draw);
						drawing[0].routeLength = draw.length;
					} else if (dataStore.paths[solution[0].floor][solution[0].segment].doorB[0] === startpoint) {
						draw = {};
						draw.type = 'M';
						draw.floor = solution[0].floor;
						draw.x = dataStore.paths[solution[0].floor][solution[0].segment].bx;
						draw.y = dataStore.paths[solution[0].floor][solution[0].segment].by;
						draw.length = 0;
						drawing[0].push(draw);
						draw = {};
						draw.type = 'L';
						draw.floor = solution[0].floor;
						draw.x = dataStore.paths[solution[0].floor][solution[0].segment].ax;
						draw.y = dataStore.paths[solution[0].floor][solution[0].segment].ay;
						draw.length = dataStore.paths[solution[0].floor][solution[0].segment].length;
						drawing[0].push(draw);
						drawing[0].routeLength = draw.length;
					}

// console.log('drawing', drawing);

					lastStep = 1;

					// for each floor that we have to deal with
					for (i = 0; i < portalsEntered + 1; i++) {
						for (stepNum = lastStep; stepNum < solution.length; stepNum++) {
							if (solution[stepNum].type === 'pa') {
								ax = dataStore.paths[solution[stepNum].floor][solution[stepNum].segment].ax;
								ay = dataStore.paths[solution[stepNum].floor][solution[stepNum].segment].ay;
								bx = dataStore.paths[solution[stepNum].floor][solution[stepNum].segment].bx;
								by = dataStore.paths[solution[stepNum].floor][solution[stepNum].segment].by;

								draw = {};
								draw.floor = solution[stepNum].floor;
// console.log('step ', solution, stepNum, ax, ay, bx, by, drawing, i, drawing[i].slice(-1)[0]);
								if (drawing[i].slice(-1)[0].x === ax && drawing[i].slice(-1)[0].y === ay) {
									draw.x = bx;
									draw.y = by;
								} else {
									draw.x = ax;
									draw.y = ay;
								}
								draw.length = dataStore.paths[solution[stepNum].floor][solution[stepNum].segment].length;
								draw.type = 'L';
								drawing[i].push(draw);
								drawing[i].routeLength += draw.length;
							}
							if (solution[stepNum].type === 'po') {
								drawing[i + 1] = [];
								drawing[i + 1].routeLength = 0;
								// push the first object on
								// check for more than just floor number here....
								pick = '';
								if (dataStore.portals[solution[stepNum].segment].floorANum === dataStore.portals[solution[stepNum].segment].floorBNum) {
									if (dataStore.portals[solution[stepNum].segment].xA === draw.x && dataStore.portals[solution[stepNum].segment].yA === draw.y) {
										pick = 'B';
									} else {
										pick = 'A';
									}
								} else {
									if (dataStore.portals[solution[stepNum].segment].floorANum === solution[stepNum].floor) {
										pick = 'A';
									} else if (dataStore.portals[solution[stepNum].segment].floorBNum === solution[stepNum].floor) {
										pick = 'B';
									}
								}
								if (pick === 'A') {
									draw = {};
									draw.floor = solution[stepNum].floor;
									draw.type = 'M';
									draw.x = dataStore.portals[solution[stepNum].segment].xA;
									draw.y = dataStore.portals[solution[stepNum].segment].yA;
									draw.length = 0;
									drawing[i + 1].push(draw);
									drawing[i + 1].routeLength = draw.length;
								} else if (pick === 'B') {
									draw = {};
									draw.floor = solution[stepNum].floor;
									draw.type = 'M';
									draw.x = dataStore.portals[solution[stepNum].segment].xB;
									draw.y = dataStore.portals[solution[stepNum].segment].yB;
									draw.length = 0;
									drawing[i + 1].push(draw);
									drawing[i + 1].routeLength = draw.length;
								}
								lastStep = stepNum;
								lastStep++;
								stepNum = solution.length;
							}
						}
					}

					//go back through the drawing and insert curves if requested
					//consolidate colinear line segments?
					if (options.path.radius > 0) {
						for (level = 0; level < drawing.length; level++) {
							for (i = 1; i < drawing[level].length - 1; i++) {
								if (drawing[level][i].type === 'L' && drawing[level][i].type === 'L') {
									// check for colinear here and remove first segment, and add its length to second
									aDX = (drawing[level][i - 1].x - drawing[level][i].x);
									aDY = (drawing[level][i - 1].y - drawing[level][i].y);
									bDX = (drawing[level][i].x - drawing[level][i + 1].x);
									bDY = (drawing[level][i].y - drawing[level][i + 1].y);
									// if the change in Y for both is Zero
									if ((aDY === 0 && bDY === 0) || (aDX === 0 && bDX === 0) || ((aDX / aDY) === (bDX / bDY) && !(aDX === 0 && aDY === 0 && bDX === 0 && bDY === 0))) {
										drawing[level][i + 1].length = drawing[level][i].length + drawing[level][i + 1].length;
//                                      drawing[level][i+1].type = "L";
										drawing[level].splice(i, 1);
										i = 1;
									}
								}
							}
							for (i = 1; i < drawing[level].length - 1; i++) {
								// locate possible curves based on both line segments being longer than options.path.radius
								if (drawing[level][i].type === 'L' && drawing[level][i].type === 'L' && drawing[level][i].length > options.path.radius && drawing[level][i + 1].length > options.path.radius) {
									//save old end point
									cx = drawing[level][i].x;
									cy = drawing[level][i].y;
									// change x,y and change length
									px = drawing[level][i - 1].x;
									py = drawing[level][i - 1].y;
									//new=prior + ((center-prior) * ((length-radius)/length))
									drawing[level][i].x = (Number(px) + ((cx - px) * ((drawing[level][i].length - options.path.radius) / drawing[level][i].length)));
									drawing[level][i].y = (Number(py) + ((cy - py) * ((drawing[level][i].length - options.path.radius) / drawing[level][i].length)));
									//shorten current line
									drawing[level][i].length = drawing[level][i].length - options.path.radius;
									curve = {};
									//curve center is old end point
									curve.cx = cx;
									curve.cy = cy;
									//curve end point is based on next line
									nx = drawing[level][i + 1].x;
									ny = drawing[level][i + 1].y;
									curve.x = (Number(cx) + ((nx - cx) * ((options.path.radius) / drawing[level][i + 1].length)));
									curve.y = (Number(cy) + ((ny - cy) * ((options.path.radius) / drawing[level][i + 1].length)));
									//change length of next segment now that it has a new starting point
									drawing[level][i + 1].length = drawing[level][i + 1].length - options.path.radius;
									curve.type = 'Q';
									curve.floor = drawing[level][i].floor;
									// insert curve element
									// splice function on arrays allows insertion
									//   array.splice(start, delete count, value, value)
									// drawing[level].splice(current line, 0, curve element object);

									drawing[level].splice(i + 1, 0, curve);

								} // both possible segments long enough
							} // drawing segment
						} // level
					} // if we are doing curves at all

					$.each(drawing, function (i, level) {
						var path = '',
							newPath;
						$.each(level, function (j, stroke) {
							switch (stroke.type) {
							case 'M':
								path = 'M' + stroke.x + ',' + stroke.y;
								break;
							case 'L':
								path += 'L' + stroke.x + ',' + stroke.y;
								break;
							case 'Q':
								path += 'Q' + stroke.cx + ',' + stroke.cy + ' ' + stroke.x + ',' + stroke.y;
								break;
							}
						});

						newPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
						newPath.setAttribute('d', path);
						newPath.style.fill = 'none';

						if (newPath.classList) {
							newPath.classList.add('directionPath' + i);
						} else {
							newPath.setAttribute('class', 'directionPath' + i);
						}


						// Attach the newpath to the startpin or endpin if they exist on this floor
						var attachPointSvg = $('#' + maps[level[0].floor].id + ' svg');
						var startPin = $('.startPin', attachPointSvg);
						var destinationPin = $('.destinationPin', attachPointSvg);

						if (startPin.length) {
							startPin.before(newPath);
						}
						else if (destinationPin.length) {
							destinationPin.before(newPath);
						}
						else {
							attachPointSvg.append(newPath);
						}

						thisPath = $('#' + maps[level[0].floor].id + ' svg .directionPath' + i);

						drawing[i].path = thisPath;

					});

					animatePath(drawing, 0);

					//on switch which floor is displayed reset path svgStrokeDashOffset to minPath and the reanimate
					//notify animation loop?
				}
			}
		} //RouteTo



		function build(startpoint, maps, accessible) {

console.log('build', startpoint, maps, accessible);

			// Reset dataStore data
			if(accessible === undefined) {
				accessible = false;
			}
			accessible = accessible;

			dataStore = {
				'paths': [],
				'portals': []
			};

			portalSegments = [];

			// Build the dataStore from each map given
			$.each(maps, function(i, map) {
				// cleanupSVG(map.el); // commented out as already run by initialize
				buildDataStore(i, map, map.el);
			});

			buildPortals(maps);

			generateRoutes(startpoint, maps);

// console.log(dataStore);

			return dataStore;
		} // function build

		function replaceLoadScreen(el) {
			var displayNum,
				mapNum;

console.log('replaceLoadScreen', el);

			$('#WayfindingStatus').remove();

			// loop ensures defaultMap is in fact one of the maps
			displayNum = 0;
			for (mapNum = 0; mapNum < maps.length; mapNum++) {
				if (defaultMap === maps[mapNum].id) {
					displayNum = mapNum;
				}
			}

			// highlight starting floor
			$('#' + maps[displayNum].id, el).show();

			$(el).trigger('wayfinding:mapsVisible');

			// if endpoint was specified, route to there.
			if (typeof(options.endpoint) === 'function') {
				routeTo(options.endpoint(), el);
			} else if (typeof(options.endpoint) === 'string') {
				routeTo(options.endpoint, el);
			}

			$.event.trigger('wayfinding:ready');
		} //function replaceLoadScreen

		// Ensure a dataStore exists and is set, whether from a cache
		// or by building it.
		function establishDataStore(accessible, onReadyCallback) {

console.log('establishDataStore', accessible, onReadyCallback);

			if (accessible === undefined) {
				accessible = false;
			}

			if (options.dataStoreCache) {
				if (typeof(options.dataStoreCache) === 'object') {
					console.debug('Using passed dataStoreCache object.');

					dataStore = options.dataStoreCache;

					if(typeof(onReadyCallback) === 'function') {
						onReadyCallback();
					}
				} else if (typeof(options.dataStoreCache) === 'string') {
					console.debug('Attempting to load dataStoreCache from URL ...');
					var cacheUrl = accessible ? options.accessibleDataStoreCache : options.dataStoreCache;

					$.getJSON(cacheUrl, function (result) {
						console.debug('Using dataStoreCache from remote.');

						dataStore = result;

						if(typeof(onReadyCallback) === 'function') {
							onReadyCallback();
						}
					}).fail(function () {
						console.error('Failed to load dataStore cache from URL. Falling back to client-side dataStore generation.');

						dataStore = build(options.startpoint, maps, accessible);

						if(typeof(onReadyCallback) === 'function') {
							onReadyCallback();
						}
					});
				}
			} else {
				console.debug('No dataStore cache set, building with startpoint "' + options.startpoint + '" ...');

				dataStore = build(options.startpoint, maps, accessible);

				if(typeof(onReadyCallback) === 'function') {
					onReadyCallback();
				}
			}
		}

		// Initialize the jQuery target object
		function initialize(obj, callback) {
			var mapsProcessed = 0;

console.log('initialize', obj, callback);

			// Load SVGs off the network
			$.each(maps, function (i, map) {
				var svgDiv = $('<div id="' + map.id + '"><\/div>');

				//create svg in that div
				svgDiv.load(
					map.path,
					function (svg, status) {
						if (status === 'error') {
							svgDiv.html('<p class="text-center text-danger">Map ' + i + ' Was not found at ' +
								map.path + '<br />Please upload it in the administration section</p>');
							maps[i].el = svgDiv;
						} else {
							maps[i].svgHandle = svg;
							maps[i].el = svgDiv;

							cleanupSVG(maps[i].el);

							activateSVG(obj, svgDiv);

							mapsProcessed = mapsProcessed + 1;
						}

						if(mapsProcessed === maps.length) {
							// All SVGs have finished loading
							establishDataStore(options.accessibleRoute, function() {
								// SVGs are loaded, dataStore is set, ready the DOM
								setStartPoint(options.startpoint, obj);
								setOptions(obj);
								replaceLoadScreen(obj);

// console.log(dataStore);

								if (typeof callback === 'function') {
									callback();
								}
							});
						}
					}
				);
			});
		} // function initialize

		if (action && typeof (action) === 'object') {
			if (typeof options === 'function') {
				callback = options;
			}
			options = action;
			action = 'initialize';
		}

		// for each jQuery target object
		this.each(function () {
			// store reference to the currently processing jQuery object
			obj = $(this);

			getOptions(obj); // load the current options

console.log('wayfinding', action, options, callback);

			// Handle actions
			if (action && typeof (action) === 'string') {
				switch (action) {
				case 'initialize':
					checkIds(obj);
					initialize(obj, callback);
					break;
				case 'routeTo':
					// call method
					routeTo(passed, obj);
					break;
				case 'animatePath':
					hidePath(obj);
					animatePath(drawing, 0);
					break;
				case 'startpoint':
					// change the startpoint or startpoint for the instruction path
					if (passed === undefined) {
						result = startpoint;
					} else {
						setStartPoint(passed, obj);
						establishDataStore(options.accessibleRoute);
					}
					break;
				case 'currentMap':
					// return and set
					if (passed === undefined) {
						result = $('div:visible', obj).prop('id');
					} else {
						switchFloor(passed, obj);
					}
					break;
				case 'accessibleRoute':
					// return and set
					if (passed === undefined) {
						result = options.accessibleRoute;
					} else {
						options.accessibleRoute = passed;

						establishDataStore(options.accessibleRoute, callback);
					}
					break;
				case 'path':
					// return and set
					if (passed === undefined) {
						result = options.path;
					} else {
						options.path = $.extend(true, {}, options.path, passed);
					}
					break;
				case 'zoom':
					if (passed === undefined) {
						result = {x: 0, y: 0, z: 0};
					} else {
						if (passed === 'reset') {
							// reset zoom
							alert('reset zoom');
						} else {
							// accept object and set zoom
							alert('zoom to');
						}
					}
					break;
				case 'getDataStore':
					//shows JSON version of dataStore when called from console.
					//To facilitate caching dataStore.
					result = JSON.stringify(dataStore);
					// $('body').replaceWith(result);
					break;
				case 'getRoutes':
					//gets the length of the shortest route to one or more
					//destinations.
					if (passed === undefined) {
						result = getShortestRoute(maps, options.endpoint, startpoint);
					} else {
						result = getShortestRoute(maps, passed, startpoint);
					}
					break;
				case 'destroy':
					//remove all traces of wayfinding from the obj
					$(obj).remove();
					break;
				default:
					break;
				}
			}

			setOptions(obj);
		});

		if (result !== undefined) {
			return result;
		}

		return this;
	};
}(jQuery));

//  ]]>
