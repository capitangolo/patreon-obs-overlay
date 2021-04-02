import url from 'url'
import { patreon, oauth} from 'patreon'

import express from 'express'
import { format as formatUrl } from 'url'
import fs from 'fs'

const app = express()

const clientId = process.env.PATREON_CLIENT_ID
const clientSecret = process.env.PATREON_CLIENT_SECRET
// redirect_uri should be the full redirect url
const redirect = 'http://172.30.80.89:8080/oauth/redirect'

const oauthClient = oauth(clientId, clientSecret)

// mimic a database
const rewards = { }


const loginUrl = formatUrl({
    protocol: 'https',
    host: 'patreon.com',
    pathname: '/oauth2/authorize',
    query: {
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirect,
        state: 'chill'
    }
})

app.get('/', (req, res) => {
    console.log("Access to /")
    res.send(`<a href="${loginUrl}">Login with Patreon</a>`)
})

app.get('/oauth/redirect', (req, res) => {
    console.log("Access to /oauth/redirect")
    const { code } = req.query
    let token

    return oauthClient.getTokens(code, redirect)
        .then(({ access_token }) => {
            token = access_token // eslint-disable-line camelcase
            const apiClient = patreon(token)
            return apiClient('/current_user')
        })
        .then(({ store, rawJson }) => {
            const campaign_id = rawJson["data"]["relationships"]["campaign"]["data"]["id"]
            const apiClient = patreon(token)
            return apiClient(`/campaigns/${campaign_id}/pledges`)
        })
        .then(({ store, rawJson }) => {
            const raw_included = rawJson["included"]
            const names = { }
            raw_included.forEach((element) => {
                const element_id = element["id"] 
                if (element["type"] == "user") {
                    names[element_id] = element["attributes"]["full_name"]
                }
                if (element["type"] == "reward") {
                    names[element_id] = element["attributes"]["title"]
                }
            })
            const raw_data = rawJson["data"]
            raw_data.forEach((pledge) => { 
                if (pledge["attributes"]["declined_since"] == null && pledge["type"] == "pledge") {
                    const patron_id = pledge["relationships"]["patron"]["data"]["id"]
                    const reward_id = pledge["relationships"]["reward"]["data"]["id"]

                    const patron_name = names[patron_id] 
                    const reward_name = names[reward_id]

                    if (!rewards[reward_name]) {
                        rewards[reward_name] = []
                    }
                    rewards[reward_name].push(patron_name)
                }
            })
            return res.redirect(`/list_rewards/`)
        })
        .catch((err) => {
            console.log(err)
            console.log('Redirecting to login')
            res.redirect('/')
        })
})

app.get('/list_rewards', (req, res) => {
    var rewards_html = ""

    for (var reward_name in rewards) {
        rewards_html += `<h2>${reward_name}</h2>`
        for (var i in rewards[reward_name]) {
            const user_name = rewards[reward_name][i]
            rewards_html += `<p>${user_name}</p>`
        }
    }

    const page = `
<!DOCTYPE html>
<html>
    <head>
        <meta charset="utf-8">
        <title>Patreon Rewards</title>
        <style>
            body {
                font-family: Arial;
                font-weight: bold;
                color: white;
                -webkit-text-stroke: 1px black;
            }

            h1 {
                font-size: 40pt;
                color: #e66c6c;
                margin: 0px;
                padding: 0px; 
            }
            h2 {
                font-size: 32pt;
                color: #e66c6c; 
                margin: 10px 0px 0px 0px;
                padding: 0px; 
            }
            p {
                font-size: 24pt;
                margin: 5px 0px 0px 10px;
                padding: 0px; 
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Patreon.com/PasaCo</h1>
            ${rewards_html}
        </div>
    </body>
</html>`

    return res.send(page)
})

const server = app.listen(8080, () => {
    const { port } = server.address()
    console.log(`Listening on http:/localhost:${port}`)
})
