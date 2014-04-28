(function(fp, $, ng, undefined) {

	var facilpadApp = angular.module("facilpad", [ ]);

	function wrapApply($scope, f) {
		return function() {
			var context = this;
			var args = arguments;
			$scope.$apply(function() {
				f.apply(context, args);
			});
		}
	}

	Function.prototype.fpWrapApply = function($scope) {
		return wrapApply($scope, this);
	};

	// From http://stackoverflow.com/a/11277751/242365
	facilpadApp.factory("socket", function($rootScope) {
		var socket = io.connect(fp.SERVER);

		var onBkp = socket.on;
		socket.on = function(eventName, fn) {
			if(fn)
				arguments[1] = wrapApply($rootScope, fn);
			onBkp.apply(this, [ eventName, fn ]);
	    };
		var emitBkp = socket.emit;
		socket.emit = function(eventName, data, cb) {
			if(cb)
				arguments[2] = wrapApply($rootScope, cb);
			emitBkp.apply(this, arguments);
		};

		return socket;
	});

	facilpadApp.directive("fpDialog", function() {
		return {
			restrict: 'A',
			link: function(scope, element, attrs) {
				$(element).dialog({ autoOpen: false, modal: true, height: "auto", width: 600 });
			}
		}
	});

	facilpadApp.directive("fpSpinner", function() {
		return {
			restrict: 'A',
			link: function(scope, element, attrs) {
				$(element).spinner();
			}
		}
	});

	facilpadApp.directive("fpColourPicker", function() {
		var colourPicker = $("#colour-picker").hide();

		function textColour(colour) {
			var r = parseInt(colour.substr(0, 2), 16)/255;
			var g = parseInt(colour.substr(2, 2), 16)/255;
			var b = parseInt(colour.substr(4, 2), 16)/255;
			// See http://stackoverflow.com/a/596243/242365
			return (Math.sqrt(0.241*r*r + 0.691*g*g + 0.068*b*b) <= 0.5) ? "ffffff" : "000000";
		}

		return {
			restrict: 'A',
			link: function(scope, element, attrs) {
				scope.$watch(attrs.ngModel, function(v) {
					var colour = (v && v.match(/^[0-9a-f]{6}$/i) ? v : 'ffffff');
					element.css({ 'background-color': '#' + colour, 'color' : '#' + textColour(colour)});
				});

				var handler = function(e) {
					var target = $(e.target);
					if(target.is("#colour-picker li")) {
						element.val(target.attr("data-colour"));
						element.triggerHandler("input");
					}
					if(!target.is("#colour-picker") && !$(document.activeElement).is(element)) {
						colourPicker.hide();
						$(document).off("click keyup", handler);
					}
				};

				$(element).focus(function() {
					var link = $(this);
					var pos = link.offset();
					colourPicker.show().offset({
						top: pos.top + link.outerHeight(),
						left: pos.left
					});

					$(document).on("click keyup", handler);
				});
			}
		}
	});

	facilpadApp.directive("fpPopup", function() {
		return {
			restrict: 'A',
			link: function(scope, element, attrs) {
				var el = $(element);

				el.addClass("fp-popup fp-popup-hidden fp-popup-bottom fp-popup-right");

				scope.$watchCollection(attrs.fpPopup, function(v) {
					if(v == null)
						el.addClass("fp-popup-hidden");
					else {
						el.removeClass("fp-popup-hidden").css({ top: v.y + 'px', left: v.x + 'px' });

						var vpDim = { width: $(window).width(), height: $(window).height() };

						if(el.hasClass("fp-popup-bottom") && v.y + el.outerHeight(true) > vpDim.height)
							el.removeClass("fp-popup-bottom").addClass("fp-popup-top");
						if(el.hasClass("fp-popup-top") && v.y + parseInt(el.css("margin-top")) < 0)
							el.removeClass("fp-popup-top").addClass("fp-popup-bottom");

						if(el.hasClass("fp-popup-left") && v.x + parseInt(el.css("margin-left")) < 0)
							el.removeClass("fp-popup-left").addClass("fp-popup-right");
						if(el.hasClass("fp-popup-right") && v.x + el.outerWidth(true) > vpDim.width)
							el.removeClass("fp-popup-right").addClass("fp-popup-left");
					}
				});
			}
		};
	});

	facilpadApp.controller("PadCtrl", function($scope, socket, $timeout, $sce, $parse) {

		setTimeout(function() { $("#toolbox").menu(); }, 0);
		function updateMenu() {
			setTimeout(function() { $("#toolbox").menu("destroy").menu(); }, 0);
		}

		$scope.padData = null;
		$scope.loaded = false;
		$scope.markers = { };
		$scope.lines = { };
		$scope.views = { };
		$scope.dialog = null;
		$scope.dialogError = null;
		$scope.saveViewName = null;
		$scope.currentMarker = null;
		$scope.currentLine = null;
		$scope.messages = [ ];
		$scope.padUrl = location.protocol + "//" + location.host + location.pathname;
		$scope.error = null;
		$scope.drawing = false;
		$scope.bbox = null;
		$scope.layers = fp.getLayerInfo();
		$scope.colours = fp.COLOURS;

		socket.emit("setPadId", FacilPad.padId);

		bindSocketToScope($scope, socket);

		$scope.onMove = function() {
			if($scope.currentMarker)
				$scope.currentMarker.xy = fp.posToXy($scope.currentMarker.position);
			if($scope.currentLine && $scope.currentLine.clickPos)
				$scope.currentLine.clickXy = fp.posToXy($scope.currentLine.clickPos);
		};

		fp.mapEvents.on("move", $scope.onMove.fpWrapApply($scope));

		$scope.$watch("markers[currentMarker.id]", function() {
			if($scope.currentMarker != null)
				$scope.currentMarker = $scope.markers[$scope.currentMarker.id];
		});

		$scope.$watch("currentMarker", function() {
			$scope.onMove();
		});

		$scope.$watch("currentMarker.style", function() {
			if($scope.currentMarker != null)
				fp.addMarker($scope.currentMarker);
		});

		$scope.$watch("lines[currentLine.id]", function() {
			if($scope.currentLine != null)
				$scope.currentLine = $.extend($scope.lines[$scope.currentLine.id], { clickPos : $scope.currentLine.clickPos, clickXy : $scope.currentLine.clickXy });
		});

		$scope.$watch("layers", function() {
			updateMenu();
		});

		fp.mapEvents.on("moveEnd", function(e, bbox) {
			socket.emit("updateBbox", bbox);

			$scope.$apply(function() {
				$scope.bbox = bbox;
			});
		});

		$scope.$watch("padData", function(newValue) {
			if($scope.error) {
				$scope.closeMessage($scope.error);
				$scope.error = null;
			}

			if(newValue == null || $scope.loaded)
				return;

			$scope.loaded = true;
			FacilPad.displayView(newValue.defaultView);
		});

		$scope.$watch("currentMarker", function() {
			if($scope.currentMarker != null)
				$scope.currentMarker.descriptionHtml = $scope.marked($scope.currentMarker.description);
		});

		$scope.$watch("currentMarker.description", function() {
			if($scope.currentMarker != null)
				$scope.currentMarker.descriptionHtml = $scope.marked($scope.currentMarker.description);
		});

		$scope.$watch("currentLine", function() {
			if($scope.currentLine != null)
				$scope.currentLine.descriptionHtml = $scope.marked($scope.currentLine.description);
		});

		$scope.$watch("currentLine.description", function() {
			if($scope.currentLine != null)
				$scope.currentLine.descriptionHtml = $scope.marked($scope.currentLine.description);
		});

		$scope.$watch("views", updateMenu);

		$scope.marked = function(text) {
			return text != null ? $sce.trustAsHtml(marked(text)) : null;
		};

		$scope.savePadData = function() {
			var padData = $.extend({ }, $scope.padData);
			delete padData.defaultView;
			socket.emit("editPad", padData, function(err) {
				if(err)
					$scope.dialogError = err;
				else
					$scope.closeDialog();
			});
		};

		fp.mapEvents.on("clickMarker", function(e, marker) {
			if($scope.drawing)
				return;

			$scope.currentLine = null;
			if($scope.currentMarker && $scope.currentMarker.id == marker.id)
				$scope.currentMarker = null;
			else
				$scope.currentMarker = marker;
		}.fpWrapApply($scope));

		fp.mapEvents.on("clickLine", function(e, line, clickPos) {
			if($scope.drawing)
				return;

			$scope.currentMarker = null;
			$scope.currentLine = line;
			$scope.currentLine.clickPos = clickPos;
			$scope.onMove();
		}.fpWrapApply($scope));

		$scope.addMarker = function() {
			var message = $scope.showMessage("info", "Please click on the map to add a marker.");
			fp.addClickListener(function(pos) {
				$scope.closeMessage(message);

				socket.emit("addMarker", { position: { lon: pos.lon, lat: pos.lat } }, function(err, marker) {
					if(err)
						return $scope.showMessage("error", err);

					$scope.currentMarker = marker;
					$scope.openDialog("edit-marker-dialog");
				});
			}.fpWrapApply($scope));
		};

		$scope.saveMarker = function(marker) {
			socket.emit("editMarker", marker, function(err) {
				if(err)
					$scope.dialogError = err;
				else
					$scope.closeDialog();
			})
		};

		$scope.deleteMarker = function(marker) {
			socket.emit("deleteMarker", marker, function(err) {
				if(err)
					$scope.showMessage("error", err);
			});
		};

		$scope.addLine = function() {
			socket.emit("addLine", { points: [ ] }, function(err, line) {
				line.actualPoints = [ ];
				$scope.currentLine = line;
				$scope.drawing = true;
				var message = $scope.showMessage("info", "Please click on the map to draw a line. Double-click to finish it.");

				var lastPos = null;
				var clickListener = function(pos) {
					if(lastPos && pos.lon == lastPos.lon && pos.lat == lastPos.lat) {
						$scope.closeMessage(message);
						fp.mapEvents.off("mouseMove", mouseMoveListener);

						$scope.drawing = false;

						// Finish drawing
						socket.emit("editLine", { id: line.id, points: line.points }, function(err, line) {
							if(err)
								return $scope.showMessage("error", err);

							$scope.currentLine = line;
							$scope.currentLine.clickPos = pos;
							$scope.onMove();
							$scope.openDialog("edit-line-dialog");
						});
					} else {
						line.points.push(pos);
						line.actualPoints = [ ].concat(line.points, [ pos ]); // Add pos a second time so that it gets overwritten by mouseMoveListener
						fp.addLine(line);
						fp.addClickListener(clickListener);
						lastPos = pos;
					}
				}.fpWrapApply($scope);

				var mouseMoveListener = function(e, pos) {
					if(line.actualPoints.length > 0) {
						line.actualPoints[line.actualPoints.length-1] = pos;
						fp.addLine(line);
					}
				};

				fp.addClickListener(clickListener);
				fp.mapEvents.on("mouseMove", mouseMoveListener);
			});
		};

		$scope.saveLine = function(line) {
			socket.emit("editLine", line, function(err) {
				if(err)
					$scope.dialogError = err;
				else
					$scope.closeDialog();
			})
		};

		$scope.deleteLine = function(line) {
			socket.emit("deleteLine", line, function(err) {
				if(err)
					$scope.showMessage("error", err);
			});
		};

		$scope.displayView = function(view) {
			fp.displayView(view);
		};

		$scope.saveView = function(makeDefault) {
			var view = fp.getCurrentView();
			view.name = $scope.saveViewName;
			socket.emit("addView", view, function(err, view) {
				if(err)
					return $scope.dialogError = err;

				if(makeDefault) {
					socket.emit("editPad", { defaultView: view.id }, function(err) {
						if(err)
							return $scope.dialogError = err;

						$scope.saveViewName = null;
						$scope.closeDialog();
					});
				} else {
					$scope.saveViewName = null;
					$scope.closeDialog();
				}
			});
		};

		$scope.setDefaultView = function(view) {
			socket.emit("editPad", { defaultView: view.id }, function(err) {
				if(err)
					$scope.dialogError = err;
			});
		};

		$scope.deleteView = function(view) {
			socket.emit("deleteView", { id: view.id }, function(err) {
				if(err)
					$scope.dialogError = err;
			});
		};

		$scope.openDialog = function(id) {
			var el = $("#"+id);

			var preserve = el.attr("fp-preserve");
			if(preserve)
				$scope.dialogBkp = angular.copy($parse(preserve)($scope));

			$scope.dialog = el.dialog("open").bind("dialogclose", wrapApply($scope, function() {
				$scope.dialog = null;
				$scope.dialogError = null;

				if(preserve && $scope.dialogBkp !== undefined) // undefined is set in closeDialog()
					$parse(preserve + " = fpPreserveRestore")($scope, { fpPreserveRestore: $scope.dialogBkp });
			}));
		};

		$scope.closeDialog = function(restorePreserved) {
			if(!restorePreserved)
				$scope.dialogBkp = undefined;

			setTimeout(function() { // dialogclose event handler calls $apply
				$scope.dialog.dialog("close");
			}, 0);
		};

		$scope.showMessage = function(type, message, lifetime) {
			var messageObj = {
				type: type,
				message: message
			};
			$scope.messages.push(messageObj);

			if(lifetime) {
				$timeout(function() {
					$scope.closeMessage(messageObj);
				}, lifetime);
			}

			return messageObj;
		};

		$scope.closeMessage = function(message) {
			var idx = $scope.messages.indexOf(message);
			if(idx == -1)
				return;

			$scope.messages = $scope.messages.slice(0, idx).concat($scope.messages.slice(idx+1));
		};

		$scope.round = function(number, digits) {
			var fac = Math.pow(10, digits);
			return Math.round(number*fac)/fac;
		};

		$scope.formatTime = function(seconds) {
			var hours = Math.floor(seconds/3600);
			var minutes = Math.floor((seconds%3600)/60);
			if(minutes < 10)
				minutes = "0" + minutes;
			return hours + ":" + minutes;
		};

		$scope.routingMode = function(mode) {
			switch(mode) {
				case "fastest":
				case "shortest":
					return " by car";
				case "bicycle":
					return " by bicycle";
				case "pedestrian":
					return " by foot";
				default:
					return "";
			}
		};

		$scope.setLayer = function(layer) {
			fp.showLayer(layer.permalinkName, !layer.visibility);
			$scope.layers = fp.getLayerInfo();
		};
	});

	function bindSocketToScope($scope, socket) {
		socket.on("padData", function(data) {
			$scope.padData = data;
		});

		socket.on("marker", function(data) {
			$scope.markers[data.id] = data;

			fp.addMarker(data);
		});

		socket.on("deleteMarker", function(data) {
			delete $scope.markers[data.id];

			if($scope.currentMarker && $scope.currentMarker.id == data.id && $scope.dialog && $scope.dialog.attr("id") == "edit-marker-dialog") {
				$scope.currentMarker = null;
				$scope.closeDialog();
			}

			fp.deleteMarker(data);
		});

		socket.on("line", function(data) {
			$scope.lines[data.id] = data;

			fp.addLine(data);
		});

		socket.on("deleteLine", function(data) {
			delete $scope.lines[data.id];

			if($scope.currentLine && $scope.currentLine.id == data.id && $scope.dialog && $scope.dialog.attr("id") == "edit-line-dialog") {
				$scope.currentLine = null;
				$scope.closeDialog();
			}

			fp.deleteLine(data);
		});

		socket.on("view", function(data) {
			$scope.views[data.id] = data;
		});

		socket.on("deleteView", function(data) {
			delete $scope.views[data.id];
		});

		socket.on("disconnect", function() {
			$scope.error = $scope.showMessage("error", "The connection to the server was lost.");
			$scope.markers = { };
			$scope.lines = { };
			$scope.views = { };
		});

		socket.on("reconnect", function() {
			socket.emit("setPadId", FacilPad.padId);
			socket.emit("updateBbox", $scope.bbox);
		});
	}

	$(function() {
		ng.bootstrap(document, [ "facilpad" ]);
	});

})(FacilPad, jQuery, angular);