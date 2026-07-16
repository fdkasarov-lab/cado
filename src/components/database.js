
const Mongoose = require("mongoose")
// const mysqlPromise = require('mysql2/promise');
const User = require("../model/user");
const Chats = require("../model/chats");
const ChatMessages = require('../model/message')
const localDB = process.env.MONGODB_URI || `mongodb+srv://cadoadmin:cadocadocado@cluster0.tnlrizj.mongodb.net/?appName=Cluster0`
module.exports = {
 connect:async () => {
     await Mongoose.connect(localDB)
     console.log("MongoDB Connected")
 },
    getUser: async  (id, username)=>{
        const query = username
            ? { $or: [{ _id: id }, { username }] }
            : { _id: id };

        return await User.find(query)
    },

    getRooms:async (username, res, next) => {
        return await Chats.find({
            $or: [
                {firstMember: username},
                {SecondMember: username}
            ]
        })
    },
    findUser: async (username ) =>{
        return await User.find({username: username })
    },
    findUsers: async (username,currentUser ) =>{
        return await User.find(
        {   $or: [
                {
                    $and: [
                        { $or: [{ firstName: new RegExp(`^${username}`, 'i') }, { lastName: new RegExp(`^${username}`, 'i') }] },
                        { username: { $ne: currentUser } }
                    ]
                },
                {
                    $and: [
                        { username: new RegExp(`^${username}`, 'i') },
                        { username: { $ne: currentUser } }
                    ]
                }
            ]
        });
    },
    getRoomMessages: async (username,pageSize,pageNumber )=>{
        const chats = await Chats.aggregate([
            {
                $lookup: {
                    from: "messages",
                    let: { chatId: "$chatId" ,files:'$files'},
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $eq: ["$chat_Id", "$$chatId"]
                                }
                            }
                        },
                        {
                            $match: {
                                $or: [
                                    { sender: username },
                                    { receiver: username }
                                ]
                            }
                        },
                        {
                            $sort: { _id: -1 } // Sort by the most recent messages first
                        },
                        {
                            $project: {

                                chat_Id: 0
                            }
                        },
                        {
                            $limit: pageNumber * pageSize // Limit the total number of messages retrieved
                        },
                        {
                            $group: {
                                _id: "$$chatId",
                                messages: { $push: "$$ROOT" } // Push messages into an array
                            }
                        },
                        {
                            $project: {
                                messages: {
                                    $slice: ["$messages", (pageNumber - 1) * pageSize, pageSize] // Implement pagination for messages
                                }
                            }
                        }
                    ],
                    as: "chat_messages"
                }
            },
            {
                $group: {
                    _id: "$chatId",
                    firstMember: { $first: "$firstMember" },
                    secondMember: { $first: "$SecondMember" },
                    chat_messages: { $first: "$chat_messages" } // Retrieve the paginated messages
                }
            },
            {
                $match: {
                    $or: [
                        { firstMember: username },
                        { secondMember: username }
                    ]
                }
            }

        ]);
        return chats;
    },
    createChat:async function createChat(chatData, res) {
        let date_ob = new Date();
        try {
            return await Chats.create({
               created_at: date_ob,
               chatId: chatData.id,
               firstMember: chatData.firstMember,
               SecondMember: chatData.secondMember
           }).then(chat => {
               let ret = {}
               ret.chat = chat
               return ret
           })
        }catch (err) {
            let ret = {}
            ret.error = err
        }
    },
    getUnreadMessagesCount: async function getUnreadCount(username,chat){
     return await ChatMessages.countDocuments({
         receiver:username,
         isRead:false,
         chat_Id:chat
     }).then(count=>{

         return {
             'username':username,
             'count':count,
         };
     })

    }


}


