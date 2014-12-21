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
		
	function Level(data, name) {
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
		
		function setActiveBlock(index) {
			$blocks.children().toggleClass('active', false);
			$blocks.children("li[data-index=" + index + "]").addClass('active');		
		}
		
		function getActiveBlock() {
			return $blocks.find('.active').data('index');
		}
		
		function generateBlockSelection() {
			blocks.forEach(function (block) {
				var $item = $('<li data-index="' + block.getIndex() + '" />');
				$item.append(block.getCurrentImage());					
				$blocks.append($item);
			});

			$blocks.children().first().addClass('active');
			$blocks.on('click', 'li', function () {
				var $item = $(this);
				setActiveBlock($item.data("index"));
			});
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
				
		function setZoom(val) {
			zoom = val;
			$canvases.css('width', level.getPixelWidth() * zoom);
			$canvases.css('height', level.getPixelHeight() * zoom);
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
		
		function replaceBlock(x, y, newBlock) {
			if (newBlock != level.getBlock(x, y)) {
				level.setBlock(x, y, newBlock);
				redrawBlock(x, y, blocks[newBlock]);
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
			render();
		}

		function bindEvents() {
			$controls.on('change', 'input[name=level-file]', function () {
				loadLevelFromFile(this.files[0]).done(function () {
					render();
				});
			}).on('click', 'button.zoom-in', function () {
				setZoom(zoom * ZOOM_STEP);
			}).on('click', 'button.zoom-out', function () {
				setZoom(zoom / ZOOM_STEP);
			}).on('click', 'button.previous-block', function () {
				if (curBlock > 0) {
					setBlock(curBlock - 1);
				}
			}).on('click', 'button.next-block', function () {
				if (curBlock + 1 < blockImages.length) {
					setBlock(curBlock + 1);
				}
			}).on('click', 'button.save-level', function () {
				if (level) {
					exportLevel();					
				}				
			}).on('click', 'button.new-level', function () {
				newLevel();
			});
			
			var leftButtonDown = false;
			$(document).on('mousedown', function (evt) {
				if (evt.which == 1) {
					leftButtonDown = true;
				}
			}).on('mouseup', function (evt) {
				if (evt.which == 1) {
					leftButtonDown = false;
				}
			});
			
			$canvases.last().on('click', function (evt) {
				var coords = getMouseCoordinates(evt);
				if (!evt.shiftKey) {
					replaceBlock(coords.x, coords.y, evt.ctrlKey ? 0 : getActiveBlock());
				} else {
					setActiveBlock(level.getBlock(coords.x, coords.y));
				}
			}).on('mousemove', function (evt) {
				if (leftButtonDown) {
					var coords = getMouseCoordinates(evt);
					replaceBlock(coords.x, coords.y, evt.ctrlKey ? 0 : getActiveBlock());
				}
			});
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
		
		function renderElevators() {
			var elevContext = elevatorCanvas.getContext('2d'),
				bs = BLOCK_SIZE / 2;
			
			elevContext.strokeStyle = '#ff0000';
			elevContext.beginPath();
			level.getElevators().forEach(function (elev) {
				elev.controlPoints.forEach(function (cp, index) {
					if (index === 0) {
						elevContext.moveTo(cp.x * BLOCK_SIZE + bs, cp.y * BLOCK_SIZE + bs);
					} else {
						elevContext.lineTo(cp.x * BLOCK_SIZE + bs, cp.y * BLOCK_SIZE + bs);
					}
				});
				elevContext.stroke();
			});
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
			renderElevators();
		}

		instance = {
			initialize: function () {
				bindEvents();				
				return loadData();
			},

			render: function () {
				render();
			}
		}

		return instance;
	}

	$(function () {
		var ed = new Editor();
		ed.initialize();
	});
}(window, jQuery));