import Image from "next/image";
import Link from "next/link";

const events: { title: string; date: string; links: { name: string; description: string; url: string }[] }[] = [
  {
    title: "芸能祭",
    date: "2026/9/7(月)",
    links: []
  },
  {
    title: "体育祭",
    date: "2026/9/9(水)",
    links: []
  },
  {
    title: "創作展",
    date: "2026/9/12(土) ~ 2026/9/13(日)",
    links: [
      {
        name: "工具貸出",
        description: "工具の貸し出し状況を確認できます。",
        url: ""
      },
      {
        name: "情報伝達",
        description: "創作展委員会からの各クラスへの連絡を確認できます。",
        url: ""
      }
    ]
  }
];

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-between py-32 px-16 bg-white dark:bg-black sm:items-start">
        <div className="flex flex-col items-center gap-6 text-center sm:items-start sm:text-left">
          <h1 className="max-w-xs text-3xl font-semibold leading-10 tracking-tight text-black dark:text-zinc-50">
            2026行事週間
          </h1>
        </div>
        <div>
          {events.map((event, idx) => (
            <div key={idx}>
              <h2>{event.title}</h2>
              <p>開催日: {event.date}</p>

              <div>
                {event.links.map((link, lIdx) => (
                  <div key={lIdx}>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {link.name} ↗
                    </a>
                    <p>
                      {link.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
