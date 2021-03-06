// ==UserScript==
// @name         Jira PR Badges
// @version      1.2
// @description  Adds badges to tickets in jira scrum board to indicate pull request status
// @match        https://{your-jira-server}/secure/RapidBoard.jspa?rapidView=9999*
// ==/UserScript==

const BADGE_TYPES = {
    OPEN: 'OPEN',
    IN_PROGRESS: 'IN_PROGRESS',
    MERGED: 'MERGED',
};

const BADGE_CLASSES = {
    OPEN: 'aui-lozenge-current',
    IN_PROGRESS: 'aui-lozenge-complete',
    MERGED: 'aui-lozenge-success',
};

const BADGE_TEXT = {
    OPEN: 'OPEN',
    IN_PROGRESS: 'IN PROGRESS',
    MERGED: 'MERGED',
};

const badgesCache = new Map(); // : <string, Set>
let badgesCacheLastUpdated = 0;

const cache = (ticketKey, badges) => {
    const now = new Date();
    badgesCache.set(ticketKey, badges);
    badgesCacheLastUpdated = now;
};

const clearCacheIfExpired = () => {
    const expiry = 1000 * 60 * 30; // 30 mins
    const elapsed = new Date() - badgesCacheLastUpdated;
    if (elapsed > expiry) {
        badgesCache.clear();
    }
};

const fetchBadgesAndStoreInCache = (ticketKey) => {
    cache(ticketKey, new Set()); // store empty entry in cache immediately so we don't get multiple async fetches for the same ticket

    return fetch(`https://{your-jira-server}/rest/api/latest/issue/${ticketKey}`).then(response => {
        return response.json();

    }).then(responseJson => {
        const ticketId = responseJson.id; // eg 123456
        return fetch(`https://{your-jira-server}/rest/dev-status/1.0/issue/detail?issueId=${ticketId}&applicationType=stash&dataType=pullrequest`);

    }).then(response => {
        return response.json();

    }).then(responseJson => {
        if (responseJson?.errors?.length > 0) {
            throw 'Errors detected in response for ' + ticketKey + '. Will retry.';
        }
        const prList = responseJson?.detail?.[0]?.pullRequests;
        const badges = new Set();
        prList.forEach(pr => {
            if (pr.status === 'OPEN') {
                if (!pr.reviewers?.length) {
                    badges.add(BADGE_TYPES.OPEN);
                } else {
                    badges.add(BADGE_TYPES.IN_PROGRESS);
                }
            } else if (pr.status === 'MERGED') {
                badges.add(BADGE_TYPES.MERGED);
            }
        });
        cache(ticketKey, badges);
        return badges;

    }).catch((err) => {
        cache(ticketKey, undefined); // clear this entry from the cache so it'll try to fetch again on the next pass
        console.error(err);
        return new Set();
    });
};

const fetchBadgesOrGetFromCache = (ticketKey) => {
    const cached = badgesCache.get(ticketKey);
    if (cached) {
        return Promise.resolve(cached);
    }
    return fetchBadgesAndStoreInCache(ticketKey);
};

const addBadge = (ticket, keySelector) => {
    const ticketKey = ticket.querySelector(keySelector)?.innerText; // eg MEM-1234
    if (!ticketKey) {
        return;
    }
    const ticketAlreadyHasBadges = ticket.querySelector('.fancy-badge');
    if (ticketAlreadyHasBadges && badgesCache.get(ticketKey)) {
        return; // ticket is cached and already present
    }
    fetchBadgesOrGetFromCache(ticketKey).then(badges => {
        ticket.querySelectorAll('.fancy-badge').forEach(badge => badge.parentNode.removeChild(badge));
        badges.forEach(badge => {
            ticket.innerHTML += ` <span class="fancy-badge aui-lozenge ${BADGE_CLASSES[badge]}">${BADGE_TEXT[badge]}</span>`
        });
    }).catch((err) => console.error(err));
};

const addBadges = () => {
    clearCacheIfExpired();
    const tickets = document.querySelectorAll('.ghx-issue-fields');
    const parentTickets = document.querySelectorAll('.ghx-heading');
    tickets.forEach(ticket => addBadge(ticket, '.ghx-key'));
    parentTickets.forEach(parentTicket => addBadge(parentTicket, '.ghx-parent-key'));
};

const main = () => {
    setTimeout(function() {
        addBadges();
        main();
    }, 2000);
};

main();
