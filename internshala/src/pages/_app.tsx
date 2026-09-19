import Footer from "@/Components/Footer";
import { Navbar } from "@/Components/Navbar";
import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { store } from "../store/store";
import { Provider, useDispatch } from "react-redux";
import { useEffect } from "react";
import { auth } from "@/firebase/firebase";
import { login, logout } from "@/feature/userSlice";
import { ToastContainer } from "react-toastify";

export default function App({ Component, pageProps }: AppProps) {
  function AuthListener() {
    const dispatch = useDispatch();
    useEffect(() => {
      auth.onAuthStateChanged((authUser) => {
        if (authUser) {
          dispatch(
            login({
              uid: authUser.uid,
              photo: authUser.photoURL,
              name: authUser.displayName,
              email: authUser.email,
              phoneNumber: authUser.phoneNumber,
            }),
          );
        } else {
          dispatch(logout());
        }
      });
    }, [dispatch]);
    return null;
  }

  return (
    <Provider store={store}>
      <AuthListener />
      <div className="bg-white">
        <ToastContainer />
        <Navbar />
        <Component {...pageProps} />
        <Footer />
      </div>
    </Provider>
  );
}
