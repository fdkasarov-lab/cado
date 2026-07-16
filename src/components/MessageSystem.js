const Message = require('../model/message')
module.exports = {
    createMessage:async (MessageData, res) => {
        let date_ob = new Date();
        return  await Message.create({
            created_at : date_ob,
            chat_Id : MessageData.room,
            sender:MessageData.sender,
            message:MessageData.message,
            receiver: MessageData.receiver,
            files : Array.isArray(MessageData.files) ? MessageData.files : []
        }).then(Message=>{
            let ret = {}
            ret.message = Message
            return ret
        })
    },
    getChatMessages:async (chatId,pageNumber) =>{
        const PageSize = 50
        let skip = 0
        if (pageNumber === 0 ){
            skip = 0
        }else {
            skip = (pageNumber - 1) * PageSize
        }

       const data =   await Message
            .find({ chat_Id: chatId })
            .sort({ _id: -1 })
           .skip(skip)
            .limit(PageSize).then(data=>{
                let ret = {}
               ret.data = data
               return ret
           })
        return data
    },
    MarkAsRead:async (data)=>{
        if (!data || !data.id) return null
        return await Message.findByIdAndUpdate(
            data.id,
            { isRead: true },
            { new: true }
        ).catch((error) => {
            console.log(error)
            return null
        });
    }

}
