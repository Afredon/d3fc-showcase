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

        var filterLeft = function(data, highlightedData) {
            // filter
            var dataOnLeft = data.filter(function(x) {return x.date <= viewScale.domain()[0]; });

            // augment with intersection of data with brush border by interpolating
            if (dataOnLeft[dataOnLeft.length - 1].date < viewScale.domain()[0]) {
                var interpolatedClose = linearInterpolation(
                    viewScale.domain()[0],
                    dataOnLeft[dataOnLeft.length - 1].date,
                    highlightedData[0].date,
                    dataOnLeft[dataOnLeft.length - 1].close,
                    highlightedData[0].close);
                var interpolatedData = {date: viewScale.domain()[0], close: interpolatedClose};
                dataOnLeft.push(interpolatedData);
                highlightedData.unshift(interpolatedData);
            }
            return dataOnLeft;
        };

        var filterRight = function(data, highlightedData) {
            var dataOnRight = data.filter(function(x) {return x.date >= viewScale.domain()[1]; });

            if (dataOnRight[0].date > viewScale.domain()[1]) {
                var interpolatedClose = linearInterpolation(
                    viewScale.domain()[1],
                    highlightedData[highlightedData.length - 1].date,
                    dataOnRight[0].date,
                    highlightedData[highlightedData.length - 1].close,
                    dataOnRight[0].close);
                var interpolatedData = {date: viewScale.domain()[1], close: interpolatedClose};
                dataOnRight.unshift(interpolatedData);
                highlightedData.push(interpolatedData);
            }
            return dataOnRight;
        };

        var filterHighlight = function(data) {
            var filteredData = data.filter(function(x) {
                return x.date >= viewScale.domain()[0] &&
                    x.date <= viewScale.domain()[1];
            });

            return filteredData;
        };

        var navMulti = fc.series.multi().series([areaLeft, areaHighlight, areaRight, line, brush])
            .mapping(function(series) {
                var highlightedData = filterHighlight(this.data);
                var leftData = filterLeft(this.data, highlightedData);
                var rightData = filterRight(this.data, highlightedData);

                switch (series) {
                    case brush: {
                        brush.extent([
                            [viewScale.domain()[0], navChart.yDomain()[0]],
                            [viewScale.domain()[1], navChart.yDomain()[1]]
                        ]);
                        return this.data;
                    }
                    case areaLeft:
                        return leftData;
                    case areaHighlight:
                        return highlightedData;
                    case areaRight:
                        return rightData;

                    default: return this.data;
                }
            });

        var layoutWidth;

        function nav(selection) {
            var navbarContainer = selection.select('#navbar-container');
            var navbarReset = selection.select('#navbar-reset');
            var model = navbarContainer.datum();

            viewScale.domain(model.viewDomain);

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

            brush.on('brush', brushed)
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

        function brushed() {
            var extent0 = brush.extent(),
                extent1;

            // if dragging, preserve the width of the extednt
            if (d3.event.mode === 'move') {
                // var d0 = d3.time.day.round(extent0[0]),
                //     d1 = d3.time.day.offset(d0, Math.round((extent0[1] - extent0[0]) / 864e5));
                // extent1 = [d0, d1];
                extent1 = extent0;
            }
            // otherwise, if resizing, round both dates
            else {
                extent0[0][0] = d3.time.day.floor(extent0[0][0]);
                extent0[1][0] = d3.time.day.ceil(extent0[1][0]);
                extent1 = extent0;
            }
            d3.select(this).call(brush.extent(extent1));

            if (brush.extent()[0][0] - brush.extent()[1][0] !== 0) {
                dispatch[sc.event.viewChange]([brush.extent()[0][0], brush.extent()[1][0]]);
            }
        }

        d3.rebind(nav, dispatch, 'on');

        nav.dimensionChanged = function(container) {
            layoutWidth = parseInt(container.style('width'));
            viewScale.range([0, layoutWidth]);
        };

        return nav;
    };
})(d3, fc, sc);
