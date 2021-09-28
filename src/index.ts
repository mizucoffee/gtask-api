import express from "express";
import { google } from "googleapis";
import { urlencoded } from "body-parser";
import uniq from "unique-string";
import { PrismaClient } from '@prisma/client'

if (!process.env.GOOLGE_CREDENTIALS) {
  console.error("ERROR: Not found GOOGLE_CREDENTIALS");
  process.exit(1);
}

const prisma = new PrismaClient()
const app = express();
const credentials = JSON.parse(process.env.GOOLGE_CREDENTIALS);
const { client_secret, client_id, redirect_uris } = credentials.installed;
const oAuth2Client = new google.auth.OAuth2(
  client_id,
  client_secret,
  redirect_uris[0]
);

app.use(urlencoded({extended: true}));
app.set("view engine", "pug");
app.use(express.static("public"));
app.use((req, res, next) => {
  req.lang = req.acceptsLanguages("ja") ? "ja" : "en";
  next();
});
app.listen(3000);

app.get("/", (req, res) => res.redirect(`/${req.lang}/`));

app.get("/privacy", (req, res) => res.redirect(`/${req.lang}/privacy`));

app.get("/:lang(ja|en)/", (req, res) => {
  res.render(`${req.params.lang}/index`, {
    url: oAuth2Client.generateAuthUrl({
      access_type: "offline",
      scope: ["https://www.googleapis.com/auth/tasks"],
    }),
  });
});

app.get("/:lang(ja|en)/privacy", (req, res) => res.render(`${req.params.lang}/privacy`));

app.post("/:lang(ja|en)/auth", async (req, res) => {
  try {
    const token = await oAuth2Client.getToken(req.body.code);
    const id = uniq()
    prisma.googleToken.create({ data: { id, ...token.tokens } })
    res.render(`${req.params.lang}/success`, { id });
  } catch (e) {
    console.log(e);
    res.render(`${req.params.lang}/fail`);
  }
});

app.post("/create", async (req, res) => {
  if (!req.body.hasOwnProperty("id"))
    return res.status(400).send("Invalid Request");
  if (!req.body.hasOwnProperty("title") || req.body.title == "")
    return res.status(400).send("Invalid Request");
  if (!req.body.hasOwnProperty("tasklist") || req.body.tasklist == "")
    return res.status(400).send("Invalid Request");
  if (!store.has(req.body.id)) return res.status(404).send("Not Found");

  const title = req.body.title;
  const notes = req.body.notes;
  const tasklist = req.body.tasklist;
  let due = req.body.due == "" ? null : req.body.due;

  try {
    const tasks = google.tasks({
      version: "v1",
      auth: await refreshOAuth2Client(JSON.parse(store.get(req.body.id))),
    });

    if (
      (await tasks.tasklists.list()).data.items.filter(
        (i) => i.title == tasklist
      ).length == 0
    ) {
      await tasks.tasklists.insert({
        resource: {
          title: tasklist,
        },
      });
    }

    if (due && due.match(/^\d{2}\/\d{2}\/\d{4} at \d{1,2}:\d{1,2}(am|pm)$/)) {
      const data = due.split(" ")[0].split("/");
      due = `${data[2]}-${data[0]}-${data[1]}T00:00:00Z`;
    }

    if (due && due.match(/^\d{2}\/\d{2}\/\d{4}$/)) {
      const data = due.split("/");
      due = `${data[2]}-${data[0]}-${data[1]}T00:00:00Z`;
    }

    const tasklistId = (await tasks.tasklists.list()).data.items.filter(
      (i) => i.title == tasklist
    )[0].id;
    await tasks.tasks.insert({
      tasklist: tasklistId,
      resource: {
        title,
        notes,
        due,
      },
    });
    res.send("Success");
  } catch (e) {
    console.log(e);
    res.status(400).send("Request Error");
  }
});


async function refreshOAuth2Client(t) {
  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    redirect_uris[0]
  );

  oAuth2Client.setCredentials(t);
  const token = await oAuth2Client.refreshAccessToken();
  oAuth2Client.setCredentials(token.credentials);

  return oAuth2Client;
}
