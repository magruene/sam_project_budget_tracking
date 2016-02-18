(function (global, $) {
    "use strict";
    if (AJS === undefined) {
        var AJS = {};
        AJS.$ = $;
    }
    var loggedWorkPerTeamAndEpic;

    var tableMarkup = '<div class="row-fluid"> <h3>{{team}}</h3> <h4>Projects with Budget</h4> <table id="results_{{team}}" class="table table-striped"> <thead> <tr> <th width="60%"></th> <th width="10%"></th> <th width="10%"></th> <th width="20%"></th> </tr> </thead> <tbody> </tbody> </table> <h4>Projects without Budget</h4> <table id="results_noBudget_{{team}}" class="table table-striped"> <thead> <tr> <th width="60%"></th> <th width="10%"></th> <th width="10%"></th> <th width="20%"></th> </tr> </thead> <tbody> </tbody> </table> </div>';

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
            var mainSelector;
            if (calculationResult.withBudget) {
                mainSelector = "#results_";
            } else {
                mainSelector = "#results_noBudget_"
            }
            if (shouldRemoveRow(currentEpic.fields, lastFixVersion, nextFixVersion, calculationResult)) {
                AJS.$(mainSelector + team + " #row_" + epicKey).remove();
            } else {
                AJS.$(mainSelector + team + " #spinner_" + epicKey).hide();
                AJS.$(mainSelector + team + " #total_" + epicKey).append("<div class='resultH'>" + Math.round(calculationResult.totalEstimate * 100) / 100 + "</div>");
                AJS.$(mainSelector + team + " #remaining_" + epicKey).append("<div class='resultH'>" + Math.round(calculationResult.remainingEstimate * 100) / 100 + "</div>");
                if (calculationResult.loggedWork > 0) {
                    AJS.$(mainSelector + team + " #logged_" + epicKey).append("<div class='resultH'>" + Math.round(calculationResult.loggedWork * 100) / 100 + "</div>");
                } else {
                    AJS.$(mainSelector + team + " #logged_" + epicKey).append("<div class='resultH'>0</div>");
                }
            }
        } else {
            AJS.$(mainSelector + team + "#row_" + epicKey).remove();
        }
    }

    function isEpicWithBudget(epicLink) {
        return epicLink.indexOf("WP-") !== -1 || epicLink.indexOf("SO-") !== -1 || epicLink.indexOf("CR-") !== -1 || epicLink.indexOf("OXO - ") !== -1;
    }

    function search() {
        loggedWorkPerTeamAndEpic = {
            "Skipper": {}, "Yankee": {}, "Catta": {}
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
                AJS.$.each(loggedWorkPerTeamAndEpic, function (team) {
                    AJS.$.each(loggedWorkPerTeamAndEpic[team], function (epicKey, calculationResult) {
                        pasteEpicToUi(calculationResult, lastFixVersion, nextFixVersion, team, epicKey);
                    });
                });
                gadget.resize();
            }
        });

        AJS.$.ajax({
            url: "http://jira.swisscom.com/rest/api/2/search?maxResults=2000&fields=summary,customfield_14850,customfield_12150,aggregatetimeoriginalestimate,status,issuetype&jql=" + allBudgetabbleTOIssues + " or (project = sam and issuetype=Epic and team in (Skipper, Yankee, Catta) and " + fixVersionQuery + ")",
            dataType: "json",
            success: function (issues) {
                var actualIssues = issues.issues;
                if (actualIssues.length > 0) {
                    var groupedIssuesByTeam = _.groupBy(actualIssues, function (issue) {
                        return issue.fields.customfield_14850.value; //Team
                    });
                    AJS.$.each(_.keys(groupedIssuesByTeam), function (index, currentTeam) {
                        $("#" + currentTeam + "_container").append(tableMarkup.replace(new RegExp("{{team}}", 'g'), currentTeam));
                        var issueGroup = groupedIssuesByTeam[currentTeam];
                        AJS.$.each(issueGroup, function (index, issue) {
                            var epicKey = getEpicKey(issue);
                            if (epicKey === null) {
                                console.log("Issue ", issue, " has no epic link")
                            }

                            if (loggedWorkPerTeamAndEpic[currentTeam][epicKey] === undefined) {
                                loggedWorkPerTeamAndEpic[currentTeam][epicKey] = {
                                    "loggedWork": 0,
                                    "totalEstimate": 0,
                                    "remainingEstimate": 0
                                };
                                prepareEpic(epicKey, currentTeam).then(function (epic) {
                                    loggedWorkPerTeamAndEpic[currentTeam][epicKey].epic = epic;
                                    getWorklogForIssue(epic.key, epic.key, currentTeam);
                                });
                            }
                            if (issue.fields.issuetype.name !== "Epic") {
                                calculateLoggedWorkSumOnStory(issue);
                            }
                        });
                    });
                }
            }
        });
    }

    function getEpicKey(issue) {
        if (issue.fields.issuetype.name === "Epic") {
            return issue.key;
        } else {
            return issue.fields.customfield_12150;
        }
    }

    function prepareEpic(epicKey, team) {
        return AJS.$.ajax({
            url: "http://jira.swisscom.com/rest/api/2/issue/" + epicKey + "?fields=key,summary,fixVersions",
            dataType: "json",
            success: function (issue) {
                var epic = issue;
                loggedWorkPerTeamAndEpic[team][epicKey].withBudget = isEpicWithBudget(epic.fields.summary);
                var spinnerMarkup = '<div id="spinner_' + epic.key + '" class="spinner"><div class="rect1"></div><div class="rect2"></div><div class="rect3"></div><div class="rect4"></div><div class="rect5"></div></div>';
                var mainSelector;
                if (loggedWorkPerTeamAndEpic[team][epicKey].withBudget) {
                    mainSelector = "#results_";
                } else {
                    mainSelector = "#results_noBudget_"
                }
                AJS.$(mainSelector + team + " tbody").append('<tr id="row_' + epic.key + '"><td>' + epic.fields.summary + '</td><td id="logged_' + epic.key + '">' + spinnerMarkup + '</td><td id="total_' + epic.key + '">' + spinnerMarkup + '</td><td id="remaining_' + epic.key + '">' + spinnerMarkup + '</td></tr>');
                return epic;
            }
        });
    }

    function calculateLoggedWorkSumOnStory(story) {
        var epicKey = story.fields.customfield_12150;
        var team = story.fields.customfield_14850.value;
        getWorklogForIssue(story.key, epicKey, team);
        getLoggedWorkForSubtasks(story, epicKey, team);
        var issueEstimation = story.fields.aggregatetimeoriginalestimate / 28800;
        loggedWorkPerTeamAndEpic[team][epicKey].totalEstimate += issueEstimation;
        if (story.fields.status.name !== "R4Review" && story.fields.status.name !== "Closed") {
            loggedWorkPerTeamAndEpic[team][epicKey].remainingEstimate += issueEstimation;
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
                    loggedWorkPerTeamAndEpic[team][epicKey].loggedWork += (sumLoggedWork / 28800);
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