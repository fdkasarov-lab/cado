const Chat = require('../model/chats')
module.exports = {
    createChat:async (chatData, res) => {
    let date_ob = new Date();
    await Chat.create({
        created_at : date_ob,
        chatId : chatData.id,
        firstMember:chatData.firstMember,
        secondMember: chatData.secondMember
    }).then(chat=>{
        res.status(200).json({
            message: "Chat successfully created",
            chat,
        })
    })
    }
}