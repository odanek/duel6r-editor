(function (window, $, undefined) {
	"use strict"

	var BLOCK_SIZE = 32,
		ZOOM_STEP = 1.2;
	
	var Overlay = {
		show: function () {
		},
		
		hide: function () {
		}
	};			
		
	var mouse = {
		x: 0,
		y: 0
	};

	var EditorMode = {
		BLOCK: 'block',
		ELEVATOR: 'elevator'
	}

	var hoveredElevator = -1;
	var editorMode = EditorMode.BLOCK;

	function Level(data, name) {
		var activeElevator = -1;
	
		return {
			getBlock: function (x, y) {
				return data.blocks[y * data.width + x];
			},
			
			setBlock: function (x, y, block) {
				data.blocks[y * data.width + x] = block;
			},
		
			getWidth: function () {
				return data.width;
			},
			
			getHeight: function () {
				return data.height;
			},
			
			getPixelWidth: function () {
				return data.width * BLOCK_SIZE;
			},
			
			getPixelHeight: function () {
				return data.height * BLOCK_SIZE;
			},
			
			getElevators: function () {
				return data.elevators;
			},
			
			getName: function () {
				return name;
			},
			
			getJson: function () {
				return JSON.stringify(data);
			},
			
			getActiveElevator: function () {
				return activeElevator;
			},
			
			setActiveElevator: function (index) {
				activeElevator = index;
			}
		};		
	}
	
	function Block(index, meta) {
		var images = [],
			currentAnimation = 0;
		
		return {
			getIndex: function () {
				return index;
			},
			
			getAnimationCount: function () {
				return meta.animations.length;
			},
			
			isAnimated: function () {
				return this.getAnimationCount() > 1;
			},
			
			loadImages: function () {
				var deferred = $.Deferred(),
					animations = this.getAnimationCount(),
					loaded = 0;
								
				for (var i = 0; i < animations; i++) {
					var img = new Image();
					var path = 'blocks/' + meta.animations[i] + '.png';
					img.src = path;
					img.onload = function () {
						loaded++;
						if (loaded == animations) {
							deferred.resolve();
						}
					};
					images.push(img);
				}
				
				return deferred.promise();
			},
			
			getCurrentImage: function () {
				return images[currentAnimation];
			},
			
			moveAnimation: function () {
				currentAnimation = (currentAnimation + 1) % this.getAnimationCount();
			}
		};
	}
	
	function Editor() {
		var $editor = $(".editor");
		var $canvases = $(".editor canvas"),
			gridCanvas = $canvases.filter(".grid").get(0),
			blockCanvas = $canvases.filter(".blocks").get(0),
			elevatorCanvas = $canvases.filter(".elevators").get(0),
			$controls = $(".control-panel"),
			$blocks = $controls.find(".blocks > ul"),
			context = blockCanvas.getContext('2d'),
			instance,
			level,
			zoom = 1.0,
			blocks = [],
			curBlock = 0;
			
		function loadBlockMeta() {
			return $.getJSON('data/blocks.json').done(function (data) {
				var idx = 0;					
				data.forEach(function (blockMeta) {
					blocks.push(new Block(idx, blockMeta));
					idx++;
				});
			});
		}
		
		function setActiveBlock(index, category) {
			var target;
			switch(category){
				case 1: target = 'active';
					break;
				case 3: target = 'active-secondary';
					break;
				default: return;
			}

			$blocks.children().toggleClass(target, false);
			$blocks.children("li[data-index=" + index + "]").addClass(target);
		}

		function getActiveBlock(category) {
			var target = '.active';
			switch(category){
				case 1: target = '.active';
					break;
				case 3: target = '.active-secondary';
					break;
				default: return;
			}
			return $blocks.find(target).data('index');
		}
		
		function generateBlockSelection() {
			blocks.forEach(function (block) {
				var $item = $('<li data-index="' + block.getIndex() + '" />');
				$item.append(block.getCurrentImage());
				$blocks.append($item);
			});

			$blocks.children().first().addClass('active');
			$blocks.children().first().addClass('active-secondary');
			$blocks.on('click', 'li', function (evt) {
				var $item = $(this);
				setActiveBlock($item.data("index"), evt.which);
			});
			$blocks.on('mousedown', 'li', function (evt) {
				var $item = $(this);
				setActiveBlock($item.data("index"), evt.which);
			});
			$blocks.contextmenu(function(evt){evt.preventDefault();});
		}
		
		function moveAnimations() {
			blocks.forEach(function (block) {
				block.moveAnimation();
				if (block.isAnimated()) {
					var $item = $blocks.children('li[data-index=' + block.getIndex() + ']');
					$item.children().replaceWith(block.getCurrentImage());
				}
			});
			
			if (level) {
				renderBlocks(true);
			}
		}
		
		function startAnimationTimer() {
			setInterval(function () {
				moveAnimations();
			}, 700);
		}
			
		function loadBlockImages() {
			var deferreds = [];

			blocks.forEach(function (block) {
				deferreds.push(block.loadImages());
			});
			
			return $.when.apply($, deferreds).done(function () {
				generateBlockSelection();
				startAnimationTimer();
			});
		}
		
		function loadData() {
			return loadBlockMeta().then(loadBlockImages);
		}

		function setZoom(val, center) {
			center = center || {x:0, y:0};
			var shrinking = val < zoom;
			var oldZoom = zoom;
			zoom = val;

			$canvases.css('width', level.getPixelWidth() * zoom);
			$canvases.css('height', level.getPixelHeight() * zoom);

			var left = $canvases.first()[0].offsetLeft;
			var top = $canvases.first()[0].offsetTop;
			var dL = center.x * BLOCK_SIZE * (zoom - oldZoom);
			var dT = center.y * BLOCK_SIZE * (zoom - oldZoom);
			$canvases.each(function (i, c){
				c.style.left = (left - dL) + 'px';
				c.style.top = (top - dT) + 'px';
			});

			$controls.find("input.zoom-val").val(Math.round(zoom * 100) + " %");
		}

		function openLevel(data, name) {
			level = new Level(data, name);

			$canvases.each(function () {
				this.width = level.getPixelWidth();
				this.height = level.getPixelHeight();
			});
			setZoom(1.0);
			
			var $dimTable = $("table.level-dimensions");
			$dimTable.find(".level-width").html(level.getWidth());
			$dimTable.find(".level-height").html(level.getHeight());
			
			$controls.find("button.remove-elevator").prop('disabled', true);
			$controls.find("button.remove-elevator-point").prop('disabled', true);
			
			render();
		}

		function loadLevelFromFile(file) {
			var reader = new FileReader(), 
				deferred = $.Deferred();
				
			reader.onload = function (evt) {
				openLevel(JSON.parse(evt.target.result), file.name);
				deferred.resolve();
			};
			reader.readAsText(file);
			return deferred.promise();
		}
		
		function getMouseCoordinates(evt) {
			var ofs = $(blockCanvas).offset();
			return {
				x: Math.floor((evt.pageX - ofs.left) / zoom / BLOCK_SIZE),
				y: Math.floor((evt.pageY - ofs.top) / zoom / BLOCK_SIZE),
			}
		}
		function getMouseCoordinatesForElevators(evt) {
			var ofs = $(blockCanvas).offset();
			var blockX = (evt.pageX - ofs.left) / zoom / BLOCK_SIZE;
			var blockY = (evt.pageY - ofs.top) / zoom / BLOCK_SIZE;
			var baseX = Math.floor(blockX);
			var baseY = Math.floor(blockY);
			return {
				x: baseX + Math.floor((blockX - baseX - 0.25) * 2) / 2,
				y: baseY + Math.floor((blockY - baseY - 0.25) * 2) / 2
			}
		}
		function pickBlockFromCanvas(x, y, category) {
			setActiveBlock(level.getBlock(x, y), category)
		}

		function replaceBlock(x, y, newBlock) {
			if(!level) {
				return;
			}
			if (newBlock != level.getBlock(x, y)) {
				level.setBlock(x, y, newBlock);
				redrawBlock(x, y, blocks[newBlock]);
			}
		}

		function saveLevelDialog() {
				if(level){
					exportLevel();
				}
		}

		function exportLevel() {
			var data = "text/json;charset=utf-8," + encodeURIComponent(level.getJson());
			var $link = $('<a download="' + level.getName() + '" href="data:' + data + '" class="download-link">Download</a>');
			$link.appendTo($("body")).get(0).click();
			$link.remove();
		}
		
		function newLevel() {
			var width = parseInt(prompt("Level width:", 20) || "20"),
				height = parseInt(prompt("Level height:", 20) || "20"),
				size = width * height,
				blocks = [];
				
			while (size > 0) {
				blocks.push(0);
				size--;
			}
				
			openLevel({
				width: width,
				height: height,
				blocks: blocks,
				elevators: []
			}, "new-level.json");
		}
		function delta(x, y, x2, y2) {
				return Math.sqrt(Math.pow(x - x2, 2) + Math.pow(y - y2, 2));
		}

		function findElevator(x, y, result) {
			if(!result){
				result = {};
			}
			var elevators = level.getElevators(), points;
			for (var i = 0; i < elevators.length; i++) {
				points = elevators[i].controlPoints;
				for (var j = 0; j < points.length; j++) {
					if(delta(points[j].x, points[j].y, x, y) <= 0.1) {
						result.circular = j === 0;
						result.elevator = elevators[i];
						return i;
					}
				}
			}
			
			return -1;
		}
		
		function chooseElevator(index) {
			level.setActiveElevator(index);
			renderElevators(true);		
			
			var noElevatorChosen = (index == -1);
			$controls.find("button.remove-elevator").prop('disabled', noElevatorChosen);
			$controls.find("button.remove-elevator-point").prop('disabled', noElevatorChosen);			
		}
		
		function createElevator(x, y) {
			var elevators = level.getElevators();
			elevators.push({
				controlPoints: [{
					x: x,
					y: y,
				  wait: 0}],
				circular: false,
			});
			chooseElevator(elevators.length - 1);
		}
		
		function removeElevator() {
			level.getElevators().splice(level.getActiveElevator(), 1);
			chooseElevator(-1);
		}
		
		function popElevatorPoint() {
			var elev = level.getElevators()[level.getActiveElevator()],
				pointNum = elev.controlPoints.length;
				
			if (pointNum == 1) {
				removeElevator();
			} else {
				elev.controlPoints.pop();
				renderElevators(true);
			}
		}
		
		function addControlPoint(x, y) {
			var elev = level.getElevators()[level.getActiveElevator()];
			elev.controlPoints.push({
				x: x,
				y: y,
				wait: 0
			});
			renderElevators(true);
		}

		function zoomIn(center){
			setZoom(zoom * ZOOM_STEP, center);
		}

		function zoomOut(center){
			setZoom(zoom / ZOOM_STEP, center);
		}

		function bindEvents() {
			$controls.on('change', 'input[name=level-file]', function () {
				loadLevelFromFile(this.files[0]);
			}).on('click', 'button.zoom-in', zoomIn)
			.on('click', 'button.zoom-out', zoomOut)
			.on('click', 'button.previous-block', function () {
				if (curBlock > 0) {
					setBlock(curBlock - 1);
				}
			}).on('click', 'button.next-block', function () {
				if (curBlock + 1 < blockImages.length) {
					setBlock(curBlock + 1);
				}
			}).on('click', 'button.save-level', saveLevelDialog)
			.on('click', 'button.new-level', function () {
				newLevel();
			}).on('click', 'button.remove-elevator', function () {
				removeElevator();
			}).on('click', 'button.remove-elevator-point', function () {
				popElevatorPoint();
			});
			window.document.addEventListener('keydown', function save(evt){
				if(evt.ctrlKey || evt.metaKey) {
					switch (String.fromCharCode(evt.which).toLowerCase()){
						case 's': saveLevelDialog();
							evt.preventDefault();
							evt.stopPropagation();
							return false;
						break;
					}
				}
			}, true);

			var leftButtonDown = false;
			var middleButtonDown = false;
			var rightButtonDown = false;
			var dx = 0;
			var dy = 0;
			$editor.on('mousedown', function (evt) {
				var coords = getMouseCoordinates(evt);
				switch(evt.which){
					case 1: leftButtonDown = true;
						break;
					case 2: middleButtonDown = true;
						evt.preventDefault();
						break;
					case 3: rightButtonDown = true;
						if(evt.altKey){
							pickBlockFromCanvas(coords.x, coords.y, evt.which);
						} else {
							replaceBlock(coords.x, coords.y, getActiveBlock(evt.which));
						}
						evt.preventDefault();
						break;
				}
			}).on('mouseup', function (evt) {
				switch(evt.which){
					case 1: leftButtonDown = false;
						break;
					case 2: middleButtonDown = false;
						break;
					case 3: rightButtonDown = false;
						break;
				}
			}).on('mousemove', function (evt) {
				middleButtonDown = (evt.buttons & 4) === 4;
				var oldMode = editorMode;
				editorMode = evt.shiftKey ? EditorMode.ELEVATOR : EditorMode.BLOCK;
				if(oldMode !== editorMode || editorMode === EditorMode.ELEVATOR){
					var coords = getMouseCoordinatesForElevators(evt);
				  hoveredElevator = findElevator(coords.x, coords.y);
					renderElevators(true);
				}
				mouse.x = evt.pageX;
				mouse.y = evt.pageY;
				if(middleButtonDown) {
					$canvases.each(function (i, c){
						c.style.left = (c.offsetLeft - (dx - evt.screenX)) + 'px';
						c.style.top = (c.offsetTop - (dy - evt.screenY)) + 'px';
					});
				}
				dx = evt.screenX;
				dy = evt.screenY;
			});
			$editor[0].addEventListener('wheel', function(evt){
				var coords = getMouseCoordinates(evt);
				if(evt.ctrlKey){
					if(evt.deltaY < 0){
						zoomIn(coords);
					} else if (evt.deltaY > 0){
						zoomOut(coords);
					}
					evt.preventDefault();
				}
			});
			$canvases.last().on('click', function (evt) {
				var coords = getMouseCoordinates(evt);
				
				if (evt.shiftKey) {
					coords = getMouseCoordinatesForElevators(evt);
					var result = {};
					var elevIndex = findElevator(coords.x, coords.y, result);

					if (elevIndex != -1) {
						if (elevIndex == level.getActiveElevator()) {
							result.elevator.circular  = result.circular;
							chooseElevator(-1);
						} else {
							chooseElevator(elevIndex);
						}
					} else {
						if (level.getActiveElevator() == -1) {
							createElevator(coords.x, coords.y);
						} else {
							addControlPoint(coords.x, coords.y);
						}
					}
				} else if(evt.altKey){
					pickBlockFromCanvas(coords.x, coords.y, evt.which);
				} else {
					replaceBlock(coords.x, coords.y, evt.ctrlKey ? 0 : getActiveBlock(evt.which));
				}
			}).on('mousemove', function (evt) {
				leftButtonDown = (evt.buttons & 1) === 1;
				rightButtonDown = (evt.buttons & 2) === 2;
				middleButtonDown = (evt.buttons & 4) === 4;
				var which = leftButtonDown ? 1 : rightButtonDown ? 3 : null;
				if (which) {
					var coords = getMouseCoordinates(evt);
					if(evt.altKey){
						pickBlockFromCanvas(coords.x, coords.y, evt.which);
					} else if(!evt.shiftKey){
						replaceBlock(coords.x, coords.y, evt.ctrlKey ? 0 : getActiveBlock(which));
					}
				}
			});
			$editor.contextmenu(function(evt){evt.preventDefault();});
		}
				
		function renderGrid() {
			var gridContext = gridCanvas.getContext('2d');
			
			gridContext.strokeStyle = '#333333';
			gridContext.setLineDash([2]);
			gridContext.beginPath();
			
			for (var x = 1; x < level.getWidth(); x++) {
				gridContext.moveTo(x * BLOCK_SIZE, 0);
				gridContext.lineTo(x * BLOCK_SIZE, level.getPixelHeight());
				gridContext.stroke();			
			}

			for (var y = 1; y < level.getHeight(); y++) {
				gridContext.moveTo(0, y * BLOCK_SIZE);
				gridContext.lineTo(level.getPixelWidth(), y * BLOCK_SIZE);
				gridContext.stroke();			
			}
		}

		var renderElevators = function renderElevators(clear) {
			var elevContext = elevatorCanvas.getContext('2d'),
				bs = BLOCK_SIZE / 2;
			elevContext.setLineDash([]);
			elevContext.font = '12px serif';

			if (clear) {
				elevContext.clearRect(0, 0, elevatorCanvas.width, elevatorCanvas.height);
			}
			var activeElevator = null;
			level.getElevators().forEach(function (elev, elevIndex) {
				var active = elevIndex == level.getActiveElevator();
				var hovered = hoveredElevator == elevIndex;
				if(active) {
					activeElevator = elev;
				}
				if (elev.controlPoints.length > 1) {
					elevContext.beginPath();
					elevContext.strokeStyle = active || hovered ? '#ffff00' : '#ff0000';
					elev.controlPoints.forEach(function (cp, pointIndex) {
						if (pointIndex === 0) {
							elevContext.moveTo(cp.x * BLOCK_SIZE + bs, cp.y * BLOCK_SIZE + bs);
						} else {
							elevContext.lineTo(cp.x * BLOCK_SIZE + bs, cp.y * BLOCK_SIZE + bs);
						}
					});
					if(elev.circular) {
						var p = elev.controlPoints[0];
						elevContext.lineTo(p.x * BLOCK_SIZE + bs, p.y * BLOCK_SIZE + bs);
					}
					elevContext.stroke();
				}

				elev.controlPoints.forEach(function (coords, cpIndex) {
					var first = cpIndex === 0;
					renderPoint(coords, active ? 'blue' : hovered ? 'yellow' : 'red', first ? 1 : 0.5)
				})
			});

			function renderPoint(coords, color, size){
				size = size || 1;
				elevContext.beginPath();
				elevContext.arc(coords.x * BLOCK_SIZE + bs, coords.y * BLOCK_SIZE + bs, BLOCK_SIZE * (size / 4), 0, 2 * Math.PI, false);
				elevContext.fillStyle = color;
				elevContext.fill();
				elevContext.lineWidth = 2;
				elevContext.strokeStyle = 'white';
				elevContext.stroke();

			}
			if(editorMode === EditorMode.ELEVATOR){
				var evt = {pageX: mouse.x, pageY: mouse.y};
				var coords = getMouseCoordinatesForElevators(evt);
				renderPoint(coords, 'yellow')

				if(activeElevator && activeElevator.controlPoints.length > 0){
					elevContext.beginPath();
					elevContext.setLineDash([5,15]);
					elevContext.strokeStyle = activeElevator ? '#ffff00' : '#ff0000';
					var cp = activeElevator.controlPoints[activeElevator.controlPoints.length - 1];
					elevContext.moveTo(cp.x * BLOCK_SIZE + bs, cp.y * BLOCK_SIZE + bs);
					elevContext.lineTo(coords.x * BLOCK_SIZE + bs, coords.y * BLOCK_SIZE + bs);
					elevContext.stroke();

					if(activeElevator.controlPoints.length > 1){
						var first = activeElevator.controlPoints[0];
						elevContext.strokeStyle = 'yellow;'
						elevContext.fillText('FINISH - CIRCULAR', (first.x - 0.5) * BLOCK_SIZE + bs, (first.y - 0.5) * BLOCK_SIZE + bs);
						elevContext.fillText('FINISH', (cp.x - 0.5) * BLOCK_SIZE + bs, (cp.y - 0.5) * BLOCK_SIZE + bs);
					}

				}
			}
		}
		
		function renderBlock(x, y, block) {
			context.drawImage(block.getCurrentImage(), x * BLOCK_SIZE, y * BLOCK_SIZE);
		}
		
		function eraseBlock(x, y) {
			context.clearRect(x * BLOCK_SIZE, y * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
		}

		function redrawBlock(x, y, block) {
			if (block.getIndex() > 0) {
				renderBlock(x, y, block);
			} else {
				eraseBlock(x, y);
			}		
		}		
		
		function renderBlocks(refresh) {
			var x, y, block, needsRefresh;
			for (y = 0; y < level.getHeight(); y++) {
				for (x = 0; x < level.getWidth(); x++) {
					block = blocks[level.getBlock(x, y)];
					needsRefresh = !refresh || block.getAnimationCount() > 1;
					if (block.getIndex() > 0 && needsRefresh) {
						renderBlock(x, y, block);
					}					
				}
			}		
		}
		
		function render() {
			renderGrid();
			renderBlocks(false);
			renderElevators(false);
		}

		instance = {
			initialize: function () {
				bindEvents();				
				return loadData();
			}
		}

		return instance;
	}

	$(function () {
		var ed = new Editor();
		ed.initialize();
	});
}(window, jQuery));
