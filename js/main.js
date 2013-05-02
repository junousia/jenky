$(function() {
    var Job = Backbone.Model.extend({
        idAttribute: 'name',
        initialize: function() {
            this.set('displayName', this.displayName());
            this.set('failCount', this.failCount());
            this.on('change:name', function() {
                this.set('displayName', this.displayName());
            }, this);
        },
        displayName: function() {
            return window.jenky.conf.jenky.translate[this.get('name')]? window.jenky.conf.jenky.translate[this.get('name')] : this.get('name').replace(/_/g, ' ');
        },
        realDuration: function() {
            return Date.now() - this.get('lastBuild').timestamp;
        },
        failCount: function() {
            var lastBuild = this.get('lastBuild')
            actions = lastBuild['actions'].filter(function(x){if(x['failCount']) return true;});

            try {
                return actions[0]['failCount'] + " failed"
            }
            catch(err) {
                return "";
            }
        }
    });

    var JobsList = Backbone.Collection.extend({
        model: Job,
        url: window.jenky.conf.jenkins.url + '/api/json?tree=jobs[name,color,lastBuild[building,timestamp,estimatedDuration,actions[failCount]]]',
        sync: function(method, model, options) {
            if (method !== "read")
                return;

            return $.ajax({
                url: this.url,
                dataType: 'jsonp',
                jsonp: 'jsonp'
            }).then(_.bind(function(response) {
                _.each(response.jobs, this.addOrUpdate, this);
            }, this)).promise();
        },
        addOrUpdate: function(job) {
            var existing = this.get(job.name);

            if (_.isUndefined(existing)) {
                this.add(job);
            } else {
                existing.set(job);
                existing.trigger('change'); // TODO
            }
        },
        comparators: {
            color: function(a) {
                var color = a.get('color');
                switch (color) {
                case 'yellow':
                case 'yellow_anime':
                    return 1;
                    break;
                case 'red_anime':
                case 'red':
                    return 0;
                    break;
                default:
                    return 2;
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
            jobs.on('add', this.addOne, this);
            jobs.on('reset', this.addAll, this);
            jobs.on('all', this.render, this);
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
