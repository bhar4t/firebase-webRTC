import * as firebase from "firebase";
import "firebase/app";
import "firebase/firestore";

// import "firebase/auth";
// import "firebase/database";
// import "firebase/storage";
// import "firebase/messaging";
// import "firebase/functions";

let app = firebase.initializeApp({
  apiKey: "AIzaSyC0s2xwTwLSqtCJYJc8Zub1Otiao-Y5NaI",
  authDomain: "web-firebase-rtc.firebaseapp.com",
  databaseURL: "https://web-firebase-rtc.firebaseio.com",
  projectId: "web-firebase-rtc",
  storageBucket: "web-firebase-rtc.appspot.com",
  messagingSenderId: "694948618954",
  appId: "1:694948618954:web:7a3a446a1624f839258a33",
});

const db = app.firestore();

export default firebase;
export { db };
