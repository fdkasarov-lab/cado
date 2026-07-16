const jwt = require('jsonwebtoken');
const KeyPin = process.env.JWT_SECRET || '1044AAAA';
const legacySecrets = ['1044AAAA'].filter((secret) => secret !== KeyPin);


module.exports = {
    pin:function Pin(){
        return KeyPin;
    },
    create:function create(id,username){
        return jwt.sign({id:id, username: username}, KeyPin);
    },
    verify:function verify(token) {
        const secrets = [KeyPin, ...legacySecrets];
        let lastError;

        for (const secret of secrets) {
            try {
                return jwt.verify(token, secret);
            } catch (error) {
                lastError = error;
            }
        }

        throw lastError;
    },
}

