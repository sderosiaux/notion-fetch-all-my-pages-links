const fs = require("fs");
const puppeteer = require("puppeteer");

const traceFilePath = "notion_api_trace.txt";
const linksPath = "links.txt";

function trimStr(s, n) {
  if (s.length > n) {
    return s.substring(0, n) + "...";
  }
  return s;
}

function isApiRequest(url) {
  return url.includes("/api/v3/");
}

function ppjson(s) {
  try {
    js = JSON.parse(s);
    s = JSON.stringify(js, null, 2);
    return s;
  } catch {
    return s;
  }
}

let apiLog = [];
let links = [];

function logApiRR(method, url, status, reqBody, rspBody) {
  if (!isApiRequest(url)) {
    return;
  }
  if (method === "GET") {
    method = "GET ";
  }
  let s = `${method} ${status} ${url}`;
  apiLog.push(s);
  s = ppjson(reqBody);
  apiLog.push(s);
  s = ppjson(rspBody);
  apiLog.push(s);
  apiLog.push("-------------------------------");
}

function saveApiLog() {
  const s = apiLog.join("\n");
  fs.writeFileSync(traceFilePath, s);
  console.log(`Wrote api trace to ${traceFilePath}`);
}

function saveLinks() {
  const s = links.join("\n");
  fs.writeFileSync(linksPath, s);
  console.log(`Wrote all links (${links.length}) to ${linksPath}`);
}

let waitTime = 5 * 1000;

async function traceNotion(url) {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  page.setViewport({ height: 1000, width: 1600 });
  const c = {
    domain: "www.notion.so",
    name: "token_v2",
    value: token
  };
  await page.setCookie(c);

  await page.setRequestInterception(true);

  // those we don't want to log because they are not important
  function isSilenced(url) {
    const silenced = [
      "/api/v3/ping",
      "/appcache.html",
      "/loading-spinner.svg",
      "/api/v3/getUserAnalyticsSettings"
    ];
    for (let s of silenced) {
      if (url.includes(s)) {
        return true;
      }
    }
    return false;
  }

  function isBlacklisted(url) {
    const blacklisted = [
      "amplitude.com/",
      "fullstory.com/",
      "intercom.io/",
      "segment.io/",
      "segment.com/",
      "loggly.com/",
      "msgstore.www.notion.so/"
    ];
    for (let s of blacklisted) {
      if (url.includes(s)) {
        return true;
      }
    }
    return false;
  }

  page.on("request", request => {
    const url = request.url();
    if (isBlacklisted(url)) {
      request.abort();
      return;
    }
    request.continue();
  });

  page.on("requestfailed", request => {
    const url = request.url();
    if (isBlacklisted(url)) {
      // it was us who failed this request
      return;
    }
    console.log("request failed url:", url);
  });

  async function onResponse(response) {
    const request = response.request();
    let url = request.url();
    if (isSilenced(url)) {
      return;
    }
    let method = request.method();
    const postData = request.postData();

    // some urls are data urls and very long
    url = trimStr(url, 72);
    const status = response.status();
    try {
      const d = await response.text();
      //const dataLen = d.length;
      //if (method === "GET") {
      //  // make the length same as POST
      //  method = "GET ";
      //}
      //console.log(`${method} ${url} ${status} size: ${dataLen}`);
      if (url.includes("getRecordValues")) {
        keepPages(JSON.parse(d).results);
      } else if (url.includes("loadUserContent")) {
        keepPages(Object.values(JSON.parse(d).recordMap.block));
      }

      logApiRR(method, url, status, postData, d);
    } catch (ex) {
      console.log(`${method} ${url} ${status} ex: ${ex} FAIL !!!`);
    }
  }

  function keepPages(arr) {
    arr
      .filter(e => e.value.type === "page")
      .forEach(e => {
        const id = e.value.id.replace(/-/g, "");
        const title = slugify(e.value.properties.title);
        const link = `https://www.notion.so/${workspace}/${title}-${id}`;
        console.log(link);
        links.push(link);
      });
  }

  page.on("response", onResponse);

  await page.evaluateOnNewDocument(userId => {
    localStorage.setItem(
      "LRU:KeyValueStore2:current-user-id",
      `{"id":"KeyValueStore2:current-user-id","value":"${userId}","timestamp":1979277549796,"important":true}`
    );
  }, userId);
  await page.goto(url, { waitUntil: "networkidle2" });

  while (true) {
    const buttons = await page.$$(
      '.notion-outliner-private div[role="button"] > svg.triangle[style*="transform: rotateZ(90deg)"]'
    );
    console.log("Found " + buttons.length + " buttons not opened!");

    if (buttons.length > 0) {
      for (const ele of buttons) {
        await ele.click();

        while (true) {
          const isOpened = await ele.evaluate(node => {
            const children =
              node.parentNode.parentNode.parentNode.parentNode.parentNode
                .parentNode;
            return (
              children.childElementCount == 2 &&
              children.childNodes[1].clientHeight > 0
            );
          });
          if (!isOpened) {
            await page.waitFor(100);
          } else {
            break;
          }
        }

        await page.waitFor(100);
      }
    } else {
      break;
    }
  }

  await page.waitFor(waitTime);

  await browser.close();
}

const token = process.env.NOTION_TOKEN || "";
const userId = process.env.NOTION_USER_ID || "";
const workspace = process.env.NOTION_WORKSPACE || "";

if (!token || !userId || !workspace) {
  console.error("Please set NOTION_TOKEN NOTION_USER_ID and NOTION_WORKSPACE");
  process.exit(1);
}

async function main() {
  await traceNotion("https://www.notion.so/" + workspace);
  saveLinks();
  saveApiLog();
}
main();

function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .replace(/\s+/g, "-") // Replace spaces with -
    .replace(/[^\w\-]+/g, "") // Remove all non-word chars
    .replace(/\-\-+/g, "-"); // Replace multiple - with single - // Trim - from end of text
}
