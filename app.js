let current = 0;

const audio = document.getElementById("audio");
const title = document.getElementById("title");
const artist = document.getElementById("artist");
const songList = document.getElementById("songList");

// 🎧 曲読み込み
function loadSong(index) {
  if (!songs || !songs[index]) return;

  const song = songs[index];

  audio.src = song.src;
  title.textContent = song.title ?? "";
  artist.textContent = song.artist ?? "";

  updateMediaSession(song);
  updateSongHighlight();

  // ⭐ 歌詞ロード
  loadLyrics(song.lrc);
}

// ▶ 再生 / 停止
function playPause() {
  if (!audio) return;
  audio.paused ? audio.play() : audio.pause();
}

// ⏭ 次
function next() {
  if (!songs?.length) return;

  if (shuffle) {
    current = Math.floor(Math.random() * songs.length);
  } else {
    current = (current + 1) % songs.length;
  }

  loadSong(current);
  audio.play();
}

// ⏮ 前
function prev() {
  if (!songs?.length) return;

  current = (current - 1 + songs.length) % songs.length;
  loadSong(current);
  audio.play();
}

// 🔀 シャッフル
let shuffle = false;
function toggleShuffle() {
  shuffle = !shuffle;
}

// 🔁 リピート
let repeat = false;
function toggleRepeat() {
  repeat = !repeat;
}

// 曲終了
audio.addEventListener("ended", () => {
  if (repeat) {
    audio.currentTime = 0;
    audio.play();
  } else {
    next();
  }
});


// =====================
// 🎤 歌詞処理
// =====================
const lyricsBox = document.getElementById("lyrics");
let currentLyrics = [];

// LRC読み込み
async function loadLyrics(path) {
  if (!path) {
    lyricsBox.textContent = "歌詞なし";
    return;
  }

  try {
    const res = await fetch(path);

    if (!res.ok) {
      lyricsBox.textContent = "歌詞読み込み失敗";
      return;
    }

    const text = await res.text();

    parseLRC(text);
    renderLyrics();

  } catch (e) {
    console.error(e);
    lyricsBox.textContent = "歌詞読み込みエラー";
  }
}

// LRCパース
function parseLRC(lrc) {
  currentLyrics = [];

  const lines = lrc.split("\n");

  for (let line of lines) {
    const match = line.match(/\[(\d+):(\d+\.\d+)\](.*)/);
    if (match) {
      currentLyrics.push({
        time: parseInt(match[1]) * 60 + parseFloat(match[2]),
        text: match[3]
      });
    }
  }
}

// 歌詞表示
function renderLyrics() {
  lyricsBox.innerHTML = currentLyrics
    .map(l => `<div>${l.text}</div>`)
    .join("");
}


// =====================
// 📜 曲リスト
// =====================
function renderSongList() {
  songList.innerHTML = "";

  songs.forEach((song, i) => {
    const div = document.createElement("div");
    div.className = "song-item";
    div.textContent = `${song.title} - ${song.artist}`;

    div.onclick = () => {
      current = i;
      loadSong(current);
      audio.play();
    };

    // ダブルクリックで歌詞表示
    div.ondblclick = () => {
      current = i;
      loadSong(current);
      audio.play();
      lyricsBox.style.display = "block";
    };

    songList.appendChild(div);
  });
}

// ハイライト
function updateSongHighlight() {
  document.querySelectorAll(".song-item")
    .forEach((el, i) => {
      el.classList.toggle("active", i === current);
    });
}


// =====================
// 📱 MediaSession API
// =====================
function updateMediaSession(song) {
  if (!('mediaSession' in navigator) || !song) return;

  navigator.mediaSession.metadata = new MediaMetadata({
    title: song.title ?? "",
    artist: song.artist ?? "",
    album: "spotyfai 🎧"
  });
}

// 操作ハンドラ
navigator.mediaSession.setActionHandler("play", () => {
  audio.play();
});

navigator.mediaSession.setActionHandler("pause", () => {
  audio.pause();
});

navigator.mediaSession.setActionHandler("previoustrack", () => {
  prev();
});

navigator.mediaSession.setActionHandler("nexttrack", () => {
  next();
});


// =====================
// ▶ 初期化
// =====================
window.onload = () => {
  renderSongList();
  loadSong(current);
};