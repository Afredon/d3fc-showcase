(function(d3, fc, sc) {
    'use strict';

    sc.chart.nav = function() {
        var dispatch = d3.dispatch(
            sc.event.viewChange,
            sc.event.resetToLatest);

        var navChart = fc.chart.cartesian(fc.scale.dateTime(), d3.scale.linear())
            .yTicks(0)
            .margin({
                bottom: 40
            });

        var viewScale = fc.scale.dateTime();

        var areaLeft = fc.series.area()
            .yValue(function(d) { return d.close; });
        var areaRight = fc.series.area()
            .yValue(function(d) { return d.close; });
        var areaHighlight = fc.series.area()
            .yValue(function(d) { return d.close; })
            .decorate(function(selection) {
                selection.enter()
                .classed('highlighted', true);
            });

        var line = fc.series.line()
            .yValue(function(d) { return d.close; });
        var brush = d3.svg.brush();

        var linearInterpolation = function(fromValue, fromA, fromB, toA, toB) {
            return toA + (toB - toA) * (fromValue - fromA) / (fromB - fromA);
        };

        var splitData = function(data, output) {
            var leftData, highlightData, rightData;
            var leftHighlightDataIndex = -1;
            var rightHighlightDataIndex = -1;
            var iIndex = 0;
            var leftSelectedDate =  viewScale.domain()[0];
            var rightSelectedDate = viewScale.domain()[1];
            while (iIndex < data.length && leftHighlightDataIndex === -1) {
                if (data[iIndex].date >= leftSelectedDate) {
                    leftHighlightDataIndex = iIndex;
                }
                iIndex++;
            }
            while (iIndex < data.length && rightHighlightDataIndex === -1) {
                if (data[iIndex].date > rightSelectedDate) {
                    rightHighlightDataIndex = iIndex - 1;
                } else {
                    iIndex++;
                }
            }
            if (iIndex === data.length && rightHighlightDataIndex === -1) {
                rightHighlightDataIndex = data.length - 1;
            }
            leftData = data.slice(0, leftHighlightDataIndex);
            highlightData = data.slice(leftHighlightDataIndex, rightHighlightDataIndex + 1);
            rightData = data.slice(rightHighlightDataIndex + 1);

            var interpolatedClose;
            var interpolatedData;
            // augment left and highlightData with interpolated point
            if (leftData.length > 0) {
                interpolatedClose = linearInterpolation(
                    leftSelectedDate,
                    leftData[leftData.length - 1].date,
                    highlightData[0].date,
                    leftData[leftData.length - 1].close,
                    highlightData[0].close);
                interpolatedData = {date: leftSelectedDate, close: interpolatedClose};
                leftData.push(interpolatedData);
                if (leftSelectedDate !== highlightData[0].date) {
                    highlightData.unshift(interpolatedData);
                }
            }

            // augment left and highlightData with interpolated point
            if (rightData.length > 0) {
                interpolatedClose = linearInterpolation(
                    rightSelectedDate,
                    highlightData[highlightData.length - 1].date,
                    rightData[0].date,
                    highlightData[highlightData.length - 1].close,
                    rightData[0].close);
                interpolatedData = {date: rightSelectedDate, close: interpolatedClose};
                rightData.unshift(interpolatedData);
                if (rightSelectedDate !== highlightData[highlightData.length - 1].date) {
                    highlightData.push(interpolatedData);
                }
            }
            output.leftData = leftData;
            output.rightData = rightData;
            output.highlightData = highlightData;
        };

        var data = {};
        var refreshAreas = function(modelData) {
            var dataFromSplit = {};
            splitData(modelData, dataFromSplit);
            data.left = dataFromSplit.leftData;
            data.right = dataFromSplit.rightData;
            data.highlighted = dataFromSplit.highlightData;
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
                        return data.left;
                    case areaHighlight:
                        return data.highlighted;
                    case areaRight:
                        return data.right;

                    default: return this.data;
                }
            });

        var layoutWidth;

        function nav(selection) {
            console.log('--nav--');
            var navbarContainer = selection.select('#navbar-container');
            var navbarReset = selection.select('#navbar-reset');
            var model = navbarContainer.datum();

            viewScale.domain(model.viewDomain);
            refreshAreas(model.data);

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
        };

        return nav;
    };
})(d3, fc, sc);
