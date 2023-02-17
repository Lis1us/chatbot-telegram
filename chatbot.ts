
import _ from "npm:lodash@latest"
import { ChatGPTAPI, ChatMessage } from "npm:chatgpt@latest"
// @deno-types="npm:@types/node-telegram-bot-api@^0.57.6"
import TelegramBot from "npm:node-telegram-bot-api@latest"
import "https://deno.land/x/dotenv@v3.2.0/load.ts"
const BOT_TOKEN = Deno.env.get("BOT_TOKEN")
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")

if (!BOT_TOKEN || !OPENAI_API_KEY) {
    logWithTime("⛔️ BOT_TOKEN and OPENAI_API_KEY must be set")
    Deno.exit(1)
}
// Start telegram bot

const bot = new TelegramBot(BOT_TOKEN, { polling: true })
const botInfo = await bot.getMe()
const botName = botInfo.username ?? ""

if (!botName) {
    logWithTime("⛔️ Bot username not found")
    Deno.exit(1)
} else {
    logWithTime("🤖 Bot", `@${botName}`, "has started...")
}

// Start ChatGPT API
let chatGPTAPI: ChatGPTAPI
try {
    chatGPTAPI = new ChatGPTAPI({apiKey: OPENAI_API_KEY})
} catch (err) {
    logWithTime("⛔️ ChatGPT API error:", err.message)
    Deno.exit(1)
}
logWithTime("🔮 ChatGPT API has started...")

// Initialize convertionID and parentMessageID
let conversationID: string | undefined
let parentMessageID: string | undefined

// Handle messages
bot.on("message", async (msg) => {
    await handleMessage(msg)
})

function handleCommand(msg: TelegramBot.Message): boolean {
    const trimedText = msg.text?.replace(`@${botName}`, "").trim()

    // reload command
    if (trimedText === "/reload" || trimedText == "/reset") {
        conversationID = undefined
        parentMessageID = undefined
        bot.sendMessage(msg.chat.id, "🔄 Диалог сброшен!")
        logWithTime("🔄 Диалог сброшен.")
        return true
    }

    // help command
    if (trimedText === "/help") {
        bot.sendMessage(msg.chat.id, "🤖 Это бот на основе ChatGPT. Доступные команды:\n\n/reload - начать диалог заного\n/help - показать это сообщение;)")
        return true
    }
    return false
}


// Parse message and send to ChatGPT if needed
async function handleMessage(msg: TelegramBot.Message) {
    const chatId = msg.chat.id
    if (!msg.text) {
        return
    }

    // Only respond to messages that start with @botName or a valid command in a group chat
    if (msg.chat.type === "group" || msg.chat.type === "supergroup") {
        if (!msg.text.startsWith(`@${botName}`)) {
            handleCommand(msg)
            return
        }
    }

    // Handle commands if needed
    if (handleCommand(msg)) {
        return
    }

    // Remove @botName from message
    const message = msg.text.replace(`@${botName}`, "").trim()
    if (message === "") {
        return
    }

    logWithTime(`📩 Message from ${msg.chat.id}:`, message)

    // Send a message to the chat acknowledging receipt of their message
    let respMsg: TelegramBot.Message
    try {
        respMsg = await bot.sendMessage(chatId, "🤔", {
            reply_to_message_id: msg.message_id,
        })
        bot.sendChatAction(chatId, "typing")
    } catch (err) {
        logWithTime("⛔️ Telegram API error:", err.message)
        return
    }

    // Send message to ChatGPT
    try {
        const response: ChatMessage = await chatGPTAPI.sendMessage(message, {
            conversationId: conversationID,
            parentMessageId: parentMessageID,
            onProgress: _.throttle(async (partialResponse: ChatMessage) => {
                respMsg = await editMessage(respMsg, partialResponse.text, false)
                bot.sendChatAction(chatId, "typing")
            }, 4000, { leading: true, trailing: false }),
        })
        // Update conversationID and parentMessageID
        conversationID = response.conversationId
        parentMessageID = response.id
        editMessage(respMsg, response.text)
        logWithTime("📨 Response:", response)
    } catch (err) {
        logWithTime("⛔️ ChatGPT API error:", err.message)
        // If the error contains session token has expired, then get a new session token
        if (err.message.includes("session token may have expired")) {
            bot.sendMessage(chatId, "🔑 Истек срок токена, обновите.")
        } else {
            bot.sendMessage(chatId, "🤖 Ой, что-то пошло не так, попробуйте позже.")
        }
    }
}

// Edit telegram message
async function editMessage(msg: TelegramBot.Message, text: string, needParse = true): Promise<TelegramBot.Message> {
    if (msg.text === text || !text  || text.trim() === "") {
        return msg
    }
    try {
        const resp = await bot.editMessageText(text, {
            chat_id: msg.chat.id,
            message_id: msg.message_id,
            parse_mode: needParse ? "Markdown" : undefined,
        })
         // type of resp is boolean | Message
        if (typeof resp === "object") {
            // return a Message type instance if resp is a Message type
            return resp as TelegramBot.Message;
        } else {
            // return the original message if resp is a boolean type
            return msg;
        }
    } catch (err) {
        logWithTime("⛔️ Edit message error:", err.message)
        return msg
    }
}


// deno-lint-ignore no-explicit-any
function logWithTime(... args: any[]) {
  console.log(new Date().toLocaleString(), ...args)
}
