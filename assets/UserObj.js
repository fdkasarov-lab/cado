 class UserObj {
    constructor(username, id) {
        this._username = username;
        this._id = id;
    }

     getUsername() {
         return this._username;
     }


     setUsername(value) {
         this._username = value;
     }

     getId() {
         return this._id;
     }

     setId(value) {
         this._id = value;
     }
 }

class Room{
    constructor(name) {
        this.name = name

    }
    getName() {
        return this.name;
    }

    SetName(value) {
        this.name = value;
    }

}