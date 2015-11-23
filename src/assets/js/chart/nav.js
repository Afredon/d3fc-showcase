(function(d3, fc, sc) {
    'use strict';

    sc.chart.nav = function() {
        var dispatch = d3.dispatch(
            sc.event.viewChange,
            sc.event.resetToLatest);

        var yScale = d3.scale.linear();
        var navChart = fc.chart.cartesian(fc.scale.dateTime(), yScale)
            .yTicks(0)
            .margin({
                bottom: 40
            });

        var viewScale = fc.scale.dateTime();
        var areaData = {};

        var forcePathTop = function(path) {
            // ensure the top of the path is always the one of the container
            // to keep the gradient consistent when the user changes the selected period.
            var current = path.attr('d');
            if (current) {
                var augmented = 'M-1,0H1' + current;
                path.attr('d', augmented);
            }
        };

        var decorateArea = function(className) {
            return function(path) {
                path.enter()
                .classed(className, true);
                forcePathTop(path);
            };
        };

        var areaLeft = fc.series.area()
            .yValue(function(d) { return d.close; })
            .yScale(yScale)
            .decorate(decorateArea('unselected'));

        var areaRight = fc.series.area()
            .yValue(function(d) { return d.close; })
            .yScale(yScale)
            .decorate(decorateArea('unselected'));

        var areaHighlight = fc.series.area()
            .yValue(function(d) { return d.close; })
            .yScale(yScale)
            .decorate(decorateArea('highlight'));

        var line = fc.series.line()
            .yValue(function(d) { return d.close; });
        var brush = d3.svg.brush();

        var linearInterpolation = function(fromValue, fromA, fromB, toA, toB) {
            return toA + (toB - toA) * (fromValue - fromA) / (fromB - fromA);
        };

        var binarySearch = function(data, value, getLeftValue) {
            // Variation on classic binary search with deferred equality
            // we are not looking for the exact value but the closest value left or right
            var iMin = 0;
            var iMax = data.length - 1;
            var iMid;
            while (iMin + 1 < iMax) {
                iMid = Math.floor((iMin + iMax) / 2);
                if (data[iMid].date < value) {
                    iMin = iMid;
                } else {
                    iMax = iMid;
                }
            }
            // deferred equality
            return getLeftValue ? iMin : iMax;
        };

        var findIntervalIndexes = function(data, selectedDates) {
            // returns the indexes of the widest interval in data than is included in [left;right]
            var leftHighlightIndex = binarySearch(data, selectedDates.left, false);
            var rightHighlightIndex = binarySearch(data, selectedDates.right, true);
            return {left: leftHighlightIndex, right: rightHighlightIndex};
        };

        var calcInterpolationPoint = function(date, left, right) {
            var interpolatedClose = linearInterpolation(
                date,
                left[left.length - 1].date,
                right[0].date,
                left[left.length - 1].close,
                right[0].close);
            return {date: date, close: interpolatedClose};
        };

        var addInterpolatedPoint = function(date, left, right) {
            // Value: where interpolation is needed
            // Left, Right: arrays around the point where the interpolation is needed
            // [left] date [right] => [Left; data(date)] [data(date); Right]
            if (left.length > 0 && right.length > 0) {
                var interpolatedData = calcInterpolationPoint(date, left, right);
                left.push(interpolatedData);
                right.unshift(interpolatedData);
            }
        };

        var addInterpolatedPointsToEmptyMiddleSet = function(selectedDates, areaData) {
            var interpolatedData = calcInterpolationPoint(selectedDates.left, areaData.left, areaData.right);
            areaData.left.push(interpolatedData);
            areaData.highlight.unshift(interpolatedData);
            interpolatedData = calcInterpolationPoint(selectedDates.right, areaData.left, areaData.right);
            areaData.highlight.push(interpolatedData);
            areaData.right.unshift(interpolatedData);
        };

        var addInterpolatedPoints = function(selectedDates, areaData) {
            if (areaData.highlight.length > 0) {
                addInterpolatedPoint(selectedDates.left, areaData.left, areaData.highlight);
                addInterpolatedPoint(selectedDates.right, areaData.highlight, areaData.right);
            } else {
                addInterpolatedPointsToEmptyMiddleSet(selectedDates, areaData);
            }
        };

        var splitData = function(data) {
            var output = {};
            var selectedDates = {};
            selectedDates.left =  viewScale.domain()[0];
            selectedDates.right = viewScale.domain()[1];

            var highlightIndexes = findIntervalIndexes(data, selectedDates);

            output.left = data.slice(0, highlightIndexes.left);
            output.highlight = data.slice(highlightIndexes.left, highlightIndexes.right + 1);
            output.right = data.slice(highlightIndexes.right + 1);

            addInterpolatedPoints(selectedDates, output);

            return output;
        };

        var navMulti = fc.series.multi().series([areaLeft, areaHighlight, areaRight, line, brush])
            .mapping(function(series) {
                switch (series) {
                    case brush: {
                        brush.extent([
                            [viewScale.domain()[0], navChart.yDomain()[0]],
                            [viewScale.domain()[1], navChart.yDomain()[1]]
                        ]);
                        return this.data;
                    }
                    case areaLeft:
                        return areaData.left;
                    case areaHighlight:
                        return areaData.highlight;
                    case areaRight:
                        return areaData.right;

                    default: return this.data;
                }
            });

        var layoutWidth,
            layoutHeight;

        function nav(selection) {
            var navbarContainer = selection.select('#navbar-container');
            var navbarReset = selection.select('#navbar-reset');
            var model = navbarContainer.datum();

            viewScale.domain(model.viewDomain);
            areaData = splitData(model.data);

            var resetButton = navbarReset.selectAll('g')
                .data([model]);

            resetButton.enter()
                .append('g')
                .attr('class', 'reset-button')
                .on('click', function() { dispatch[sc.event.resetToLatest](); })
                .append('path')
                .attr('d', 'M1.5 1.5h13.438L23 20.218 14.937 38H1.5l9.406-17.782L1.5 1.5z');

            resetButton.classed('active', !model.trackingLatest);

            var filteredData = sc.util.domain.filterDataInDateRange(
                fc.util.extent().fields('date')(model.data),
                model.data);
            var yExtent = fc.util.extent()
                .fields(['low', 'high'])(filteredData);

            yScale.domain(yExtent);
            areaLeft.y0Value(yScale.domain()[0]);
            areaHighlight.y0Value(yScale.domain()[0]);
            areaRight.y0Value(yScale.domain()[0]);

            navChart.xDomain(fc.util.extent().fields('date')(model.data))
                .yDomain(yExtent);

            brush.on('brush', function() {
                if (brush.extent()[0][0] - brush.extent()[1][0] !== 0) {
                    dispatch[sc.event.viewChange]([brush.extent()[0][0], brush.extent()[1][0]]);
                }
            })
            .on('brushend', function() {
                if (brush.extent()[0][0] - brush.extent()[1][0] === 0) {
                    dispatch[sc.event.viewChange](sc.util.domain.centerOnDate(viewScale.domain(),
                        model.data, brush.extent()[0][0]));
                }
            });

            navChart.plotArea(navMulti);
            navbarContainer.call(navChart);

            // Allow to zoom using mouse, but disable panning
            var zoom = sc.behavior.zoom(layoutWidth)
                .scale(viewScale)
                .trackingLatest(model.trackingLatest)
                .allowPan(false)
                .on('zoom', function(domain) {
                    dispatch[sc.event.viewChange](domain);
                });

            selection.select('.plot-area')
                .call(zoom);
        }

        d3.rebind(nav, dispatch, 'on');

        nav.dimensionChanged = function(container) {
            layoutWidth = parseInt(container.style('width'));
            viewScale.range([0, layoutWidth]);
            layoutHeight = parseInt(container.style('height'));
            yScale.range([layoutHeight, 0]);
        };

        return nav;
    };
})(d3, fc, sc);
