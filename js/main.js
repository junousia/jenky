$(function() {
    var Job = Backbone.Model.extend({
        idAttribute: 'name',
        initialize: function() {
            this.set('displayName', this.displayName());
            this.set('failCount', this.failCount());
            this.set('buildNumber', this.buildNumber());
            this.on('change', function() {
                this.set('displayName', this.displayName());
                this.set('failCount', this.failCount());
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
        tagName: "li",
        template: _.template($('#job-template').html()),
        initialize: function() {
            this.model.on('change', this.render, this);
            this.model.on('destroy', this.remove, this);
            $(window).load(_.bind(this.showProgress, this))
        },
        render: function() {
            var rendered = this.template(_.extend({}, this.model.toJSON(), {
                previousColor: this.model.previousAttributes().color.replace(/_anime/g, '')
            }));
            this.$el.html(rendered);
            this.showProgress();
            return this;
        },
        showProgress: function() {
            var progressElement = this.$el.find('.progress');

            if (progressElement.length === 0)
                return;

            var main = progressElement.prev();
            var progress = this.model.realDuration();
            var duration = this.model.get('lastBuild').estimatedDuration;
            var p = progress / duration;
            progressElement.css({
                width: '' + Math.round(p * main.width()) + 'px'
            });
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
        render: function() {
            var windowHeight = $(window).height();

            var topMargin = 50;
            var leftMargin = 40;

            var containerHeight = windowHeight - topMargin;

            this.$el.css({
                height: containerHeight + 'px',
                top: topMargin + 'px',
                left: leftMargin + 'px'
            });

            var items = this.$el.find('li');
            var height = Math.floor(containerHeight / Math.ceil(items.length / 2));

            items.css({
                height: height
            });
        },
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
