import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyCvRsqfydT2xeeQ5tn3OpgP5ooqYfzPojY",
  authDomain: "smart-budget-tracker-23696.firebaseapp.com",
  databaseURL: "https://smart-budget-tracker-23696-default-rtdb.firebaseio.com",
  projectId: "smart-budget-tracker-23696",
  storageBucket: "smart-budget-tracker-23696.firebasestorage.app",
  messagingSenderId: "473248868290",
  appId: "1:473248868290:web:0c7809bcc1845229b8985b",
  measurementId: "G-V591H2L6K1"
};

const app = initializeApp(firebaseConfig);

// Firebase Authentication
export const auth = getAuth(app);
export const db = getDatabase(app);
export const database = getDatabase(app);

export default app;
