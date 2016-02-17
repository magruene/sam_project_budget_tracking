(function (global, $) {
    var AJS = {},
        totalSumTrackedInJira = 0;
    AJS.$ = $;

    function search() {
        var team = AJS.$("#team").val();
        var fixVersion = AJS.$("#fixVersion").val();
        $("#results tbody").empty();
        AJS.$.ajax({
            url: "http://jira.swisscom.com/rest/api/2/search?jql=project=sam and team in ('Skipper', 'Yankee', 'Catta') and issuetype=Epic and fixVersion='" + fixVersion + "'",
            dataType: "json",
            success: function (epics) {
                if (epics.issues.length > 0) {
                    console.log("Found: " + epics.issues.length + " epic(s). I will search for work logged on the epic directly.");
                    AJS.$.each(epics.issues, function (index, epic) {
                        AJS.$("#results tbody").append('<tr id="row_' + epic.id + '"><td>' + epic.fields.summary + '</td><td id="result_' + epic.id + '"><div id="spinner_' + epic.id + '" class="spinner"><div class="rect1"></div><div class="rect2"></div><div class="rect3"></div><div class="rect4"></div><div class="rect5"></div></div></td></tr>');
                        getLoggedWorkForEpic(epic).then(function (finalSum) {
                            if (finalSum > 0) {
                                totalSumTrackedInJira += (finalSum / 3600)
                                AJS.$("#spinner_" + epic.id).hide();
                                AJS.$("#result_" + epic.id).append("<div class='resultH'>" + finalSum / 3600 + "</div>");
                            } else {
                                AJS.$("#row_" + epic.id).remove();
                            }
                        });
                    });
                }
            }
        });
    }

    function getLoggedWorkForEpic(epic) {
        var loggedWorkForGivenTimeFrame = 0;
        var epicDeferred = calculateLoggedWorkSumOnGivenIssue(epic).then(function (sum) {
            loggedWorkForGivenTimeFrame += sum;
        });

        var sumWorkStories = calculateLoggedWorkOnEpicStories(epic).then(function (sum) {
            loggedWorkForGivenTimeFrame += sum;
        });

        return AJS.$.when(epicDeferred, sumWorkStories).then(function () {
            console.log("FinalSum for " + epic.fields.summary + " is " + loggedWorkForGivenTimeFrame / 3600 + "PT");
            return loggedWorkForGivenTimeFrame;
        });

    }

    function calculateLoggedWorkOnEpicStories(epic) {
        return AJS.$.getJSON("http://jira.swisscom.com/rest/api/2/search?jql='Epic Link'=" + epic.key, "json").then(function (stories) {
            var loggedWorkOnAllStories = 0;
            var defferedArray = [];
            if (stories.issues.length > 0) {
                AJS.$.each(stories.issues, function (index, story) {
                    var deferred = calculateLoggedWorkSumOnStory(story);
                    deferred.then(function (sum) {
                        loggedWorkOnAllStories += sum;
                    });
                    defferedArray.push(deferred);
                });

            }
            return AJS.$.when.apply(AJS.$, defferedArray).then(function () {
                console.log("LoggedWork on Stories: " + loggedWorkOnAllStories / 3600 + "PT");
                return loggedWorkOnAllStories;
            });
        });
    }

    function calculateLoggedWorkSumOnStory(story) {
        var loggedWorkForStory = 0;
        var storyDeferred = calculateLoggedWorkSumOnGivenIssue(story).then(function (sum) {
            loggedWorkForStory += sum;
        });

        var sumWorkSubtasks = calculateLoggedWorkSumOnStorySubtasks(story).then(function (sum) {
            loggedWorkForStory += sum;
        });

        return AJS.$.when(storyDeferred, sumWorkSubtasks).then(function () {
            console.log("SumStory for " + story.fields.summary + " is " + loggedWorkForStory / 3600 + "PT");
            return loggedWorkForStory;
        });


    }

    function calculateLoggedWorkSumOnStorySubtasks(story) {
        return AJS.$.getJSON("http://jira.swisscom.com/rest/api/2/search?jql=parent in (" + story.key + ")", "json").then(function (subtasks) {
            var loggedWorkOnAllSubtasks = 0;
            var defferedArray = [];
            if (subtasks.issues.length > 0) {
                AJS.$.each(subtasks.issues, function (index, subtask) {
                    var deferred = calculateLoggedWorkSumOnGivenIssue(subtask);
                    deferred.then(function (sum) {
                        loggedWorkOnAllSubtasks += sum;
                    });

                    defferedArray.push(deferred);
                });
            }
            return AJS.$.when.apply(AJS.$, defferedArray).then(function () {
                console.log("LoggedWork on Subtasks for " + story.fields.summary + ": " + loggedWorkOnAllSubtasks / 3600 + "PT");
                return loggedWorkOnAllSubtasks;
            });
        });
    }

    function calculateLoggedWorkSumOnGivenIssue(issue) {
        return AJS.$.getJSON("http://jira.swisscom.com/rest/api/2/issue/" + issue.key + "/worklog", "json").then(function (worklogs) {
            var from = AJS.$("#from").val();
            var fromTimeStamp = new Date(from).getTime();
            var to = AJS.$("#to").val();
            var toTimestamp = new Date(to).getTime();
            var sumLoggedWork = 0;

            if (worklogs.worklogs.length > 0) {
                AJS.$.each(worklogs.worklogs, function (index, worklog) {
                    var created = new Date(worklog.created).getTime();
                    if (created > fromTimeStamp && created < toTimestamp) {
                        sumLoggedWork += worklog.timeSpentSeconds;
                    }
                });
            }
            return sumLoggedWork;
        });
    }

    $("button").click(search);

})(window, $);