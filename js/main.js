$(function() {
    var Job = Backbone.Model.extend({
        idAttribute: 'name',
        initialize: function() {
            this.set('displayName', this.displayName());
            this.set('failCount', this.failCount());
            this.set('buildNumber', this.buildNumber());
            this.set('lastBuilt', this.lastBuilt());
            this.on('change', function() {
                this.set('displayName', this.displayName());
                this.set('failCount', this.failCount());
                this.set('lastBuilt', this.lastBuilt());
            }, this);
        },
        displayName: function() {
            var translation = window.jenky.conf.jenky.translate[this.get('name')]
            return translation? translation : this.get('name').replace(/_/g, ' ');
        },
        realDuration: function() {
            return Date.now() - this.get('lastBuild').timestamp;
        },
        filterEmpty: function(job) {
            return job['failCount']
        },
        failCount: function() {
            var lastBuild = this.get('lastBuild')
            action = lastBuild['actions'].filter(this.filterEmpty)[0];
            return action? action['failCount'] : ""
        },
        buildNumber: function() {
            return this.get('lastBuild')['number']
        },
        url: function() {
            return this.get('url');
        },
        lastBuilt: function() {
            timediff = (Date.now() - this.get('lastBuild').timestamp) / (3600*1000)
            if (timediff >= 24) {
                return "> " + Math.floor(timediff/24) + " day(s) ago"
            }
        }
    });

    var JobsList = Backbone.Collection.extend({
        model: Job,
        url: window.jenky.conf.jenkins.url + '/api/json?tree=jobs[name,color,url,lastBuild[building,number,timestamp,estimatedDuration,actions[failCount]]]',
        initialize: function() {
            this.on('change:color', function() {
                this.sort()
            })
        },
        filter: function(job) {
            return window.jenky.conf.jenky.filter.indexOf(job.name) !== -1? false : true
        },
        sync: function(method, model, options) {
            if (method !== "read")
                return;

            return $.ajax({
                url: this.url,
                dataType: 'jsonp',
                jsonp: 'jsonp'
            }).then(_.bind(function(response) {
                _.each(response.jobs.filter(this.filter), this.addOrUpdate, this);
            }, this)).promise();
        },
        addOrUpdate: function(job) {
            var existing = this.get(job.name);

            if (_.isUndefined(existing)) {
                this.add(job);
                this.sort()
            } else {
                existing.set(job);
                existing.trigger('change'); // TODO
            }
        },
        comparators: {
            color: function(a) {
                switch (a.get('color').replace(/_anime/g, '')) {
                case 'red':
                    return [0,a.get('name')];
                    break;
                case 'yellow':
                    return [1,a.get('name')];
                    break;
                case 'blue':
                    return [2,a.get('name')];
                    break;
                default:
                    return [3,a.get('name')];
                    break;
                }
            },
            name: function(a) {
                return a.get('name')
            }
        }
    });

    var jobs = window.jenky.jobs = new JobsList();
    jobs.comparator = jobs.comparators[window.jenky.conf.jenky.sortkey];

    var JobView = Backbone.View.extend({
        tagName: "div",
        className: "progress",
        template: _.template($('#job-template').html()),
        mapColor: function(color) {
            switch(color.replace(/_anime/g,'')) {
                case 'red':
                    return 'progress-bar-danger'
                case 'yellow':
                    return 'progress-bar-warning'
                case 'blue':
                    return 'progress-bar-success'
                default:
                    return 'progress-bar-info'
            }
        },
        initialize: function() {
            this.model.on('change', this.render, this);
            this.model.on('destroy', this.remove, this);
            $(window).load(_.bind(this.showProgress, this))
        },
        render: function() {
            var rendered = this.template(_.extend({}, this.model.toJSON(), {
                previousColor: this.model.previousAttributes().color.replace(/_anime/g, ''),
                color: this.mapColor(this.model.get('color'))
            }));
            this.$el.html(rendered);
            this.showProgress();
            return this;
        },
        showProgress: function() {
            var progressElement = this.$el.find('.progress-bar');

            if (progressElement.length === 0)
                return;

            var progress = this.model.realDuration();
            var lastBuild = this.model.get('lastBuild')
            var duration = lastBuild.estimatedDuration;
            
            if(lastBuild.building === true) {
                progressElement.parent().addClass('progress-striped active')
                var p = Math.round((progress / duration) * 100);
                progressElement.css({
                    width: '' + p + '%'
                 });
                progressElement.attr('aria-valuenow', p);
            } else if(this.model.get('color').match('(aborted|disabled)')) {
                progressElement.parent().addClass('grayscale')
            }
        }
    });

    var JenkyView = Backbone.View.extend({
        el: $('#jobs'),
        initialize: function() {
            this.collection = jobs
            this.collection.on('add', this.addOne, this);
            this.collection.on('reset', this.addAll, this);
            this.collection.on('all', this.render, this);
            $(window).resize(_.throttle(_.bind(this.render, this), 200));
        },
        render: function() { },
        addOne: function(job) {
            var view = new JobView({model: job});
            view.render().$el.appendTo(this.$el);
        },
        addAll: function() {
            this.$el.empty();
            jobs.each(_.bind(this.addOne, this));
        },
        update: function(delayed) {
            jobs.fetch().always(_.bind(function() {
                delayed(delayed);
            }, this));
        }
    });

    var app = window.jenky.app = new JenkyView();

    $('body').css({
        'font-family': window.jenky.conf.jenky.font
    });

    app.update(_.debounce(_.bind(app.update, app), window.jenky.conf.jenkins.updateInterval));
});
