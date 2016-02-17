(function (global, $) {
    "use strict";
    var AJS = {};
    var queue = 0;
    AJS.$ = $;
    var loggedWorkPerTeamAndEpic;


    function init() {
        AJS.$.ajax({
            url: "http://jira.swisscom.com/rest/api/2/project/SAM/versions",
            contentType: 'application/json',
            dataType: "json",
            success: function (data) {
                AJS.$.each(data, function (index, version) {
                    if (!version.released) {
                        AJS.$("#versionChooserMain").append("<option value='" + version.name + "'>" + version.name + "</option>");
                        AJS.$("#versionChooserLast").append("<option value='" + version.name + "'>" + version.name + "</option>");
                    }
                });
                AJS.$("button").click(search);
            }
        });
    }

    function search() {
        loggedWorkPerTeamAndEpic = {"Skipper": {}, "Yankee": {}, "Catta": {}};
        var team = AJS.$("#team").val();
        var fixVersion = AJS.$("#versionChooserMain").val();
        var lastFixVersion = AJS.$("#versionChooserLast").val();
        var summaryQuery = "(summary ~ 'WP-*' or summary ~ 'CR-*' or summary ~ 'SO-*' or summary ~ 'OXO-*')";
        var teamQuery = "team in ('Skipper', 'Yankee', 'Catta', 'Private', 'Rico', 'Kowalski')";
        var fixVersionQuery = "(fixVersion='" + fixVersion + "' or fixVersion='" + lastFixVersion + "')";
        var allBudgetabbleTOIssues = getBudgetabbleTOIssuesQuery(summaryQuery, teamQuery, fixVersionQuery);
        var allBudgetabbleEpics = getBudgetabbleEpicsQuery(summaryQuery, fixVersionQuery);
        var allBudgetabbleSubtasks = getBudgetabbleSubtasksQuery(allBudgetabbleTOIssues);

        $(document).ajaxStop(function () {
            if (0 === $.active) {
                AJS.$.each(loggedWorkPerTeamAndEpic, function (team, epics) {
                    AJS.$.each(epics, function (epicKey, calculationResult) {
                        var currentEpic = calculationResult.epic;
                        if (currentEpic.fields.fixVersions[0].name === lastFixVersion && calculationResult.loggedWork === 0) {
                            AJS.$("#results_" + team + "#row_" + epicKey).remove();
                        }
                        AJS.$("#results__" + team + "#spinner_" + epicKey).hide();
                        AJS.$("#results__" + team + "#total_" + epicKey).append("<div class='resultH'>" + calculationResult.totalEstimate + "</div>");
                        AJS.$("#results__" + team + "#remaining_" + epicKey).append("<div class='resultH'>" + calculationResult.remainingEstimate + "</div>");
                        if (calculationResult.loggedWork > 0) {
                            AJS.$("#results_" + team + "#logged_" + epicKey).append("<div class='resultH'>" + calculationResult.loggedWork + "</div>");
                        } else {
                            AJS.$("#results_" + team + "#logged_" + epicKey).append("<div class='resultH'>0</div>");
                        }
                    });
                });
            }
        });

        AJS.$.ajax({
            url: "http://jira.swisscom.com/rest/api/2/search?maxResults=2000&fields=summary,customfield_14850,customfield_12150,aggregatetimeoriginalestimate,status&jql=" + allBudgetabbleTOIssues,
            dataType: "json",
            success: function (issues) {

                var actualIssues = issues.issues;
                if (actualIssues.length > 0) {
                    var groupedIssuesByTeam = _.groupBy(actualIssues, function (issue) {
                        return issue.fields.customfield_14850.value; //Team
                    });
                    AJS.$.each(_.keys(groupedIssuesByTeam), function (index, currentTeam) {
                        var issueGroup = groupedIssuesByTeam[currentTeam];
                        AJS.$.each(issueGroup, function (index, issue) {
                            var epicLink = issue.fields.customfield_12150;
                            if (epicLink === null) {
                                console.log("Issue ", issue, " has no epic link")
                            }
                            if (loggedWorkPerTeamAndEpic[currentTeam][epicLink] === undefined) {
                                loggedWorkPerTeamAndEpic[currentTeam][epicLink] = {
                                    "loggedWork": 0,
                                    "totalEstimate": 0,
                                    "remainingEstimate": 0
                                };
                                prepareEpic(epicLink, currentTeam).then(function (epic) {
                                    loggedWorkPerTeamAndEpic[currentTeam][epicLink].epic = epic;
                                    calculateLoggedWorkSumOnGivenIssue(epic.key, epic.key, currentTeam);
                                });
                            }
                            calculateLoggedWorkSumOnStory(issue);
                        });
                    });
                    //console.log(loggedWorkPerTeamAndEpic);
                    //if (finalSum > 0) {
                    //    loggedWorkPerTeamAndEpic[currentTeam][epicLink] += (finalSum / 3600);
                    //    AJS.$("#spinner_" + epic.id).hide();
                    //    AJS.$("#result_" + epic.id).append("<div class='resultH'>" + loggedWorkPerTeamAndEpic[currentTeam][epicLink] + "</div>");
                    //} else {
                    //    AJS.$("#row_" + epic.id).remove();
                    //}
                    //console.log("Found: " + actualIssues.length + " epic(s). I will search for work logged on the epic directly.");
                    //AJS.$.each(actualIssues, function (index, epic) {
                    //    AJS.$("#results tbody").append('<tr id="row_' + epic.id + '"><td>' + epic.fields.summary + '</td><td id="result_' + epic.id + '"><div id="spinner_' + epic.id + '" class="spinner"><div class="rect1"></div><div class="rect2"></div><div class="rect3"></div><div class="rect4"></div><div class="rect5"></div></div></td></tr>');
                    //    getLoggedWorkForEpic(epic).then(function (finalSum) {
                    //        if (finalSum > 0) {
                    //            AJS.$("#spinner_" + epic.id).hide();
                    //            AJS.$("#result_" + epic.id).append("<div class='resultH'>" + finalSum / 3600 + "</div>");
                    //        } else {
                    //            AJS.$("#row_" + epic.id).remove();
                    //        }
                    //    });
                    //});
                }
            }
        });
    }

    function prepareEpic(epicKey, team) {
        return AJS.$.ajax({
            url: "http://jira.swisscom.com/rest/api/2/issue/" + epicKey + "?fields=key,summary,fixVersions",
            dataType: "json",
            success: function (issue) {
                var epic = issue;
                var spinnerMarkup = '<div id="spinner_' + epic.key + '" class="spinner"><div class="rect1"></div><div class="rect2"></div><div class="rect3"></div><div class="rect4"></div><div class="rect5"></div></div>';
                AJS.$("#results_" + team + " tbody").append('<tr id="row_' + epic.key + '"><td>' + epic.fields.summary + '</td><td id="logged_' + epic.key + '">' + spinnerMarkup + '</td><td id="total_' + epic.key + '">' + spinnerMarkup + '</td><td id="remaining_' + epic.key + '">' + spinnerMarkup + '</td></tr>');
                return epic;
            }
        });
    }

    function calculateLoggedWorkSumOnStory(story) {
        var epicKey = story.fields.customfield_12150;
        var team = story.fields.customfield_14850.value;
        calculateLoggedWorkSumOnGivenIssue(story.key, epicKey, team);
        calculateLoggedWorkSumOnStorySubtasks(story, epicKey, team);

        var issueEstimation = story.fields.aggregatetimeoriginalestimate / 3600;
        loggedWorkPerTeamAndEpic[team][epicKey].totalEstimate += issueEstimation;
        if (story.fields.status.name !== "R4Review" && story.fields.status.name !== "Closed") {
            loggedWorkPerTeamAndEpic[team][epicKey].remainingEstimate += issueEstimation;
        }
    }

    function getLoggedWorkForSubtasks(story, epicKey, team) {
        queue++;
        AJS.$.getJSON("http://jira.swisscom.com/rest/api/2/search?fields=key&jql=parent in (" + story.key + ")").then(function (subtasks) {
            queue--;
            if (subtasks.issues.length > 0) {
                AJS.$.each(subtasks.issues, function (index, subtask) {
                    calculateLoggedWorkSumOnGivenIssue(subtask.key, epicKey, team);
                });
            }
        });
    }

    function calculateLoggedWorkSumOnStorySubtasks(story, epicKey, team) {
        waitfor(getQueue, 5, 1000, 0, "wait to get log for: " + story.key, function () {
            getLoggedWorkForSubtasks(story, epicKey, team);
        });
    }

    function getWorklogForIssue(key, epicKey, team) {
        queue++;
        AJS.$.getJSON("http://jira.swisscom.com/rest/api/2/issue/" + key + "/worklog").then(function (worklogs) {
            queue--;
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
            if (sumLoggedWork > 0) {
                loggedWorkPerTeamAndEpic[team][epicKey].loggedWork += (sumLoggedWork / 3600);
            }
        });
    }

    function calculateLoggedWorkSumOnGivenIssue(key, epicKey, team) {
        waitfor(getQueue, 5, 1000, 0, "wait to get log for: " + key, function () {
            getWorklogForIssue(key, epicKey, team);
        });
    }

    function getQueue() {
        return queue;
    }

    function waitfor(test, expectedValue, msec, count, source, callback) {
        // Check if condition met. If not, re-check later (msec).
        // Condition finally met. callback() can be executed.
        console.log(source + ': ' + test + ', expected: ' + expectedValue + ', ' + count + ' loops.');
        callback();
    }

    function getBudgetabbleTOIssuesQuery(summaryQuery, teamQuery, fixVersionQuery) {
        //return 'issuekey=SAM-2408';
        return 'issuefunction in linkedIssuesOf("project = sam AND issuetype = Epic AND ' + summaryQuery + ' AND ' + teamQuery + ' AND ' + fixVersionQuery + '") AND team in (Skipper, Yankee, Catta) and issuetype != Epic'; //could be old epics which have been cloned and linked. Dont want those pls.
    }

    function getBudgetabbleEpicsQuery(summaryQuery, fixVersionQuery) {
        return 'project = sam AND issuetype = Epic AND ' + summaryQuery + ' AND team in (Skipper, Yankee, Catta) AND ' + fixVersionQuery;
    }

    function getBudgetabbleSubtasksQuery(allBudgetabbleTOIssues) {
        return 'issueFunction in subtasksOf(' + allBudgetabbleTOIssues + ')';
    }


    var Report = {};
    Report.init = init;
    window.Report = Report;

})(window, jQuery); 