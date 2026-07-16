 class UserObj {
    constructor(username, id, firstName, lastName) {
        this._username = username;
        this._id = id;
        this._firstName = firstName;
        this._lastName = lastName;
    }


     set firstName(value) {
         this._firstName = value;
     }

     set lastName(value) {
         this._lastName = value;
     }

     get firstName() {
         return this._firstName;
     }

     get lastName() {
         return this._lastName;
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