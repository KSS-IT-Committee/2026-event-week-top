import Image from "next/image";
import styles from "./top-page.module.css";

export default function Toppage() {
  return (
    <>
      <header className={styles.header}>
         <br /><br />
         <br /><br />
         <br /><br />
         <h2 className={styles.top}>
          2026行事週間 <br />
          9/7~9/14</h2>
         <h1 className={styles.theme}>青、薫る</h1>
         <p className={styles.scroll}>Scroll</p>
         <svg className={styles.curveLine} viewBox="0 0 100 500">
          <defs>
           <linearGradient id="thickGrad" x1="0" y1="0" x2="0" y2="1">
             <stop offset="0%" stopColor="white" stopOpacity="0.2" />
             <stop offset="50%" stopColor="white" stopOpacity="0.6" />
             <stop offset="100%" stopColor="white" stopOpacity="1" />
           </linearGradient>
          </defs>
           <path
             className={styles.flowLine}
             d="M 50 0 Q -40 250 50 550"
             stroke="url(#thickGrad)"
             strokeWidth="6"
             strokeLinecap="round"
             fill="none"
            />
         </svg>
         <br /><br />
         


      </header>

      <main>
        
      </main>
    </>
  );
}
