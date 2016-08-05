'use strict';

const apiai = require('apiai');
const uuid = require('node-uuid');
const request = require('request');

const Twilio = require('twilio-ip-messaging');
var AccessToken = require('twilio').AccessToken;
var IpMessagingGrant = AccessToken.IpMessagingGrant;

module.exports = class TwilioBot {

    get apiaiService() {
        return this._apiaiService;
    }

    set apiaiService(value) {
        this._apiaiService = value;
    }

    get botConfig() {
        return this._botConfig;
    }

    set botConfig(value) {
        this._botConfig = value;
    }

    get sessionIds() {
        return this._sessionIds;
    }

    set sessionIds(value) {
        this._sessionIds = value;
    }

    constructor(botConfig) {
        this._botConfig = botConfig;
        var apiaiOptions = {
            language: botConfig.apiaiLang,
            requestSource: "twilio-ip"
        };

        this._apiaiService = apiai(botConfig.apiaiAccessToken, apiaiOptions);
        this._sessionIds = new Map();
    }

    start() {

        this.getToken()
            .then((token) => {
                this._accessManager = new Twilio.AccessManager(token);
                this._client = new Twilio.IPMessaging.Client(this._accessManager);

                return this._client.initialize();
            });

    }

    getToken() {
        return new Promise((resolve, reject) => {
            var appName = this.botConfig.apiaiAccessToken;
            var deviceId = "server";

            // Create a unique ID for the client on their current device
            var endpointId = appName + ':' + deviceId;

            // Create a "grant" which enables a client to use IPM as a given user,
            // on a given device
            var ipmGrant = new IpMessagingGrant({
                serviceSid: this.botConfig.serviceSid,
                endpointId: endpointId
            });

            // Create an access token which we will sign and return to the client,
            // containing the grant we just created
            var token = new AccessToken(
                this.botConfig.accountSid,
                this.botConfig.signingKeySid,
                this.botConfig.signingKeySecret
            );
            token.addGrant(ipmGrant);

            resolve(token.toJwt());
        });
    }

    processMessage(req, res) {
        if (this._botConfig.devConfig) {
            console.log("body", req.body);
        }

        if (req.body && req.body.session && req.body.session.from && req.body.session.initialText) {
            let chatId = req.body.session.from.id;
            let messageText = req.body.session.initialText;

            console.log(chatId, messageText);

            if (messageText) {
                if (!this._sessionIds.has(chatId)) {
                    this._sessionIds.set(chatId, uuid.v1());
                }

                let apiaiRequest = this._apiaiService.textRequest(messageText,
                    {
                        sessionId: this._sessionIds.get(chatId)
                    });

                apiaiRequest.on('response', (response) => {
                    if (TwilioBot.isDefined(response.result)) {
                        let responseText = response.result.fulfillment.speech;

                        if (TwilioBot.isDefined(responseText)) {
                            console.log('Response as text message');

                            res.status(200).json({
                                say: {value: responseText}
                            });

                        } else {
                            console.log('Received empty speech');
                            return res.status(400).end('Received empty speech');
                        }
                    } else {
                        console.log('Received empty result');
                        return res.status(400).end('Received empty result');
                    }
                });

                apiaiRequest.on('error', (error) => console.error(error));
                apiaiRequest.end();
            }
            else {
                console.log('Empty message');
                return res.status(400).end('Empty message');
            }
        } else {
            console.log('Empty message');
            return res.status(400).end('Empty message');
        }
    }

    static isDefined(obj) {
        if (typeof obj == 'undefined') {
            return false;
        }

        if (!obj) {
            return false;
        }

        return obj != null;
    }
}