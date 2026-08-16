// Firebase Config with Correct Regional Database URL
const firebaseConfig = {
  apiKey: "AIzaSyAHU3Pf8uqhkw1WMgKIyYtFP4QhigIM1jg",
  authDomain: "qa-trims-production.firebaseapp.com",
  databaseURL: "https://qa-trims-production-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "qa-trims-production",
  storageBucket: "qa-trims-production.firebasestorage.app",
  messagingSenderId: "693190684035",
  appId: "1:693190684035:web:5210a4134f06500a895ab6",
  measurementId: "G-DP4EZG3PRJ"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const rtdb = firebase.database();
