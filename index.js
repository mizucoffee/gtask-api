const Store = require('data-store')
const store = new Store({
    path: 'token.json'
})
const express = require('express')
const fs = require('fs-extra')
const google = require('googleapis').google
const app = express()
const bodyParser = require('body-parser')
const uniq = require('unique-string')
if (!fs.pathExistsSync('credentials.json')) {
    console.error('ERROR: Not found credentials.json')
    process.exit(1)
}

const credentials = JSON.parse(fs.readFileSync('credentials.json'))
const {
    client_secret,
    client_id,
    redirect_uris
} = credentials.installed
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0])

app.use(bodyParser.urlencoded({
    extended: true
}))
app.set('view engine', 'pug')
app.use(express.static('public'))
app.listen(3000, () => {})

app.get('/', (req, res) => {
    if(req.acceptsLanguages('ja'))
        res.redirect('/ja/')
    else
        res.redirect('/en/')
})

app.get('/:lang(ja|en)/', (req, res) => {
    res.render(`${req.params.lang}/index`, {
        url: oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: ['https://www.googleapis.com/auth/tasks'],
        })
    })
})

app.post('/:lang(ja|en)/auth', async (req, res) => {
    try {
        const token = await oAuth2Client.getToken(req.body.code)
        const id = uniq()
        store.set(id, JSON.stringify(token.tokens))
        res.render(`${req.params.lang}/success`, {id})
    } catch (e) {
        console.log(e)
        res.render(`${req.params.lang}/fail`)
    }
})

app.post('/create', async (req, res) => {
    console.log(req.body)
    if (!req.body.hasOwnProperty('id')) return res.status(400).send('Invalid Request')
    if (!req.body.hasOwnProperty('title') || req.body.title == '') return res.status(400).send('Invalid Request')
    if (!req.body.hasOwnProperty('tasklist') || req.body.tasklist == '') return res.status(400).send('Invalid Request')
    if (!store.has(req.body.id)) return res.status(404).send('Not Found')

    const title = req.body.title
    const notes = req.body.notes
    const tasklist = req.body.tasklist
    let due = req.body.due

    try {
        const tasks = google.tasks({
            version: 'v1',
            auth: await refreshOAuth2Client(JSON.parse(store.get(req.body.id)))
        })

        if ((await tasks.tasklists.list()).data.items.filter(i => i.title == tasklist).length == 0) {
            await tasks.tasklists.insert({
                resource: {
                    title: tasklist
                }
            })
        }

        if (due && due.match(/^\d{2}\/\d{2}\/\d{4} at \d{2}:\d{2}(am|pm)$/)) {
            const data = due.split(' ')[0].split('/')
            due = `${data[2]}/-${data[0]}-${data[1]}T00:00:00Z`
        }

        const tasklistId = (await tasks.tasklists.list()).data.items.filter(i => i.title == tasklist)[0].id
        await tasks.tasks.insert({
            tasklist: tasklistId,
            resource: {
                title,
                notes,
                due
            }
        })
        res.send('Success')
    } catch (e) {
        console.log(e)
        res.status(400).send('Request Error')
    }
})

app.get('/:lang(ja|en)/privacy', (req, res) => {
    res.render(`${req.params.lang}/privacy`)
})

async function refreshOAuth2Client(t) {
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0])

    oAuth2Client.setCredentials(t)
    const token = await oAuth2Client.refreshAccessToken()
    oAuth2Client.setCredentials(token.credentials)

    return oAuth2Client
}
