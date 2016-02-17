(function (global, $) {
    "use strict";
    if (AJS === undefined) {
        var AJS = {};
        AJS.$ = $;
    }
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
                        AJS.$("#versionChooserNext").append("<option value='" + version.name + "'>" + version.name + "</option>");
                    }
                });
                AJS.$("button").click(search);
            }
        });
    }

    function shouldRemoveRow(fields, lastFixVersion, nextFixVersion, calculationResult) {
        return fields !== undefined && fields.fixVersions !== undefined && fields.fixVersions.length > 0 && fields.fixVersions[0].name === lastFixVersion && fields.fixVersions[0].name === nextFixVersion && calculationResult.loggedWork === 0;
    }

    function pasteEpicToUi(calculationResult, lastFixVersion, nextFixVersion, team, epicKey) {
        var currentEpic = calculationResult.epic;
        if (currentEpic !== undefined) {
            if (shouldRemoveRow(currentEpic.fields, lastFixVersion, nextFixVersion, calculationResult)) {
                AJS.$("#results_" + team + " #row_" + epicKey).remove();
            } else {
                AJS.$("#results_" + team + " #spinner_" + epicKey).hide();
                AJS.$("#results_" + team + " #total_" + epicKey).append("<div class='resultH'>" + calculationResult.totalEstimate + "</div>");
                AJS.$("#results_" + team + " #remaining_" + epicKey).append("<div class='resultH'>" + calculationResult.remainingEstimate + "</div>");
                if (calculationResult.loggedWork > 0) {
                    AJS.$("#results_" + team + " #logged_" + epicKey).append("<div class='resultH'>" + calculationResult.loggedWork + "</div>");
                } else {
                    AJS.$("#results_" + team + " #logged_" + epicKey).append("<div class='resultH'>0</div>");
                }
            }
        } else {
            AJS.$("#results_" + team + "#row_" + epicKey).remove();
        }
    }

    function search() {
        loggedWorkPerTeamAndEpic = {
            withBudget: {"Skipper": {}, "Yankee": {}, "Catta": {}},
            withoutBudget: {"Skipper": {}, "Yankee": {}, "Catta": {}}
        };
        var team = AJS.$("#team").val();
        var fixVersion = AJS.$("#versionChooserMain").val();
        var lastFixVersion = AJS.$("#versionChooserLast").val();
        var nextFixVersion = AJS.$("#versionChooserNext").val();
        var teamQuery = "team in ('Skipper', 'Yankee', 'Catta', 'Private', 'Rico', 'Kowalski')";
        var fixVersionQuery = "(fixVersion in('" + fixVersion + "', '" + lastFixVersion + "', '" + nextFixVersion + "'))";
        var allBudgetabbleTOIssues = getBudgetabbleTOIssuesQuery(teamQuery, fixVersionQuery);

        AJS.$(document).ajaxStop(function () {
            if (0 === AJS.$.active) {
                var teams = ["Skipper", "Yankee", "Catta"];
                AJS.$.each(teams, function (team) {
                    AJS.$.each(loggedWorkPerTeamAndEpic.withBudget[team], function (epicKey, calculationResult) {
                        pasteEpicToUi(calculationResult, lastFixVersion, nextFixVersion, team, epicKey);
                    });
                    AJS.$.each(loggedWorkPerTeamAndEpic.withoutBudget[team], function (epicKey, calculationResult) {
                        pasteEpicToUi(calculationResult, lastFixVersion, nextFixVersion, team, epicKey);
                    });
                });
                gadget.resize();
            }
        });

        function isEpicWithBudget(epicLink) {
            return epicLink.indexOf("WP-") !== -1 || epicLink.indexOf("SO-") !== -1 || epicLink.indexOf("CR-") !== -1 || epicLink.indexOf("OXO-") !== -1;
        }

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
                            var epicKey = issue.fields.customfield_12150;
                            if (epicKey === null) {
                                console.log("Issue ", issue, " has no epic link")
                            }

                            var store = getStore(epicKey);
                            if (store[currentTeam][epicKey] === undefined) {
                                store[currentTeam][epicKey] = {
                                    "loggedWork": 0,
                                    "totalEstimate": 0,
                                    "remainingEstimate": 0
                                };
                                prepareEpic(epicKey, currentTeam).then(function (epic) {
                                    store[currentTeam][epicKey].epic = epic;
                                    getWorklogForIssue(epic.key, epic.key, currentTeam);
                                });
                            }
                            calculateLoggedWorkSumOnStory(issue);

                        });
                    });
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
        var store = getStore(epicKey);
        getWorklogForIssue(story.key, epicKey, team);
        getLoggedWorkForSubtasks(story, epicKey, team);
        var issueEstimation = story.fields.aggregatetimeoriginalestimate / 3600;
        store[team][epicKey].totalEstimate += issueEstimation;
        if (story.fields.status.name !== "R4Review" && story.fields.status.name !== "Closed") {
            store[team][epicKey].remainingEstimate += issueEstimation;
        }
    }

    function getLoggedWorkForSubtasks(story, epicKey, team) {
        AJS.$.getJSON("http://jira.swisscom.com/rest/api/2/search?fields=key&jql=parent in (" + story.key + ")")
            .success(function (subtasks) {
                if (subtasks.issues.length > 0) {
                    AJS.$.each(subtasks.issues, function (index, subtask) {
                        getWorklogForIssue(subtask.key, epicKey, team);
                    });
                }
            })
            .error(function () {
                console.log("could not complete worklog request for: " + story.key + ". Will try again");
                getLoggedWorkForSubtasks(story, epicKey, team); // retry
            });
    }

    function getStore(epicKey) {
        var store;
        if (isEpicWithBudget(epicKey)) {
            store = loggedWorkPerTeamAndEpic.withBudget;
        } else {
            store = loggedWorkPerTeamAndEpic.withoutBudget;
        }
        return store;
    }

    function getWorklogForIssue(key, epicKey, team) {
        AJS.$.getJSON("http://jira.swisscom.com/rest/api/2/issue/" + key + "/worklog")
            .success(function (worklogs) {
                var from = AJS.$("#from").val();
                var fromTimeStamp = new Date(from).getTime();
                var to = AJS.$("#to").val();
                var toTimestamp = new Date(to).getTime();
                var sumLoggedWork = 0;

                if (worklogs.worklogs.length > 0) {
                    AJS.$.each(worklogs.worklogs, function (index, worklog) {
                        var created = new Date(worklog.started).getTime();
                        if (created > fromTimeStamp && created < toTimestamp) {
                            sumLoggedWork += worklog.timeSpentSeconds;
                        }
                    });
                }
                if (sumLoggedWork > 0) {
                    getStore(epicKey)[team][epicKey].loggedWork += (sumLoggedWork / 3600);
                }
            })
            .error(function () {
                console.log("could not complete worklog request for: " + key + ". Will try again");
                getWorklogForIssue(key, epicKey, team); // retry
            });
    }

    function getBudgetabbleTOIssuesQuery(teamQuery, fixVersionQuery) {
        //return 'issuekey=SAM-2408';
        return 'issuefunction in linkedIssuesOf("project = sam AND issuetype = Epic AND ' + teamQuery + ' AND ' + fixVersionQuery + '") AND team in (Skipper, Yankee, Catta) and issuetype != Epic'; //could be old epics which have been cloned and linked. Dont want those pls.
    }

    var Report = {};
    Report.init = init;
    window.Report = Report;

})(window, jQuery); 