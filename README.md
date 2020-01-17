# Why

I have so many pages on notion that I wanted to look randomly at some of them every day. To do that, I needed all my links available.

# How

Fetch your notion once in a while:

```
$ export NOTION_WORKSPACE=myworkspace
$ export NOTION_TOKEN=xxx
$ export NOTION_USER_ID=yyy
```

How to get these values:

- https://www.notion.so/myworkspace
- Look at your cookies: `token_v2`
- In DevTools: `JSON.parse(localStorage['LRU:KeyValueStore2:current-user-id']).value`

```
$ npm install
$ node trace.js
```

This can take some time (it is logging the found links) and will create a file `links.txt` with all your pages in it.

When it's time to procrastinate, give me a random page:

```
$ shuf -n 1 links.txt | xargs open
```

# Behind the scene

It is using puppeteer; look for collapsed nodes; expand them; wait it is expanded (notion can be damn slow); and go to the next one etc.; it recurses until exhaustion.

We're waiting for the node to be expanded to "not go too fast" and click on the wrong element if stuff is loading in the background.

I guess we could do this by API, I didn't checked.

# Credits

It's unshamelessly very-strongly inspired from the awesome work of: https://github.com/kjk/notionapi

```

```
