var audio = document.getElementById("audio");

var title = document.getElementById("title");

var artist = document.getElementById("artist");

var songList = document.getElementById("songList");

var playBtn = document.getElementById("playBtn");

var current = 0;



function safePlay(){

    var p = audio.play();

    if(p && p.catch){

        p.catch(function(){});

    }

}



function loadSong(index){

    current = index;

    var song = songs[index];

    title.innerHTML = song.title;

    artist.innerHTML = song.artist;

    audio.src = song.src;

    updateSongList();

    showToast(song.title);
}

function playPause(){

    if(audio.paused){

        safePlay();

        playBtn.innerHTML = "⏸";

    }else{

        audio.pause();

        playBtn.innerHTML = "▶";
    }
}



function next(){

    current++;

    if(current >= songs.length){

        current = 0;
    }

    loadSong(current);

    safePlay();

    playBtn.innerHTML = "⏸";
}



function prev(){

    current--;

    if(current < 0){

        current = songs.length - 1;
    }

    loadSong(current);

    safePlay();

    playBtn.innerHTML = "⏸";
}



function buildSongList(){

    for(var i=0;i<songs.length;i++){

        (function(i){

            var div = document.createElement("div");

            div.className = "song-item";

            div.innerHTML = songs[i].title;

            div.onclick = function(){

                loadSong(i);

                safePlay();

                playBtn.innerHTML = "⏸";
            };

            songList.appendChild(div);

        })(i);
    }
}



function updateSongList(){

    var items = document.getElementsByClassName("song-item");

    for(var i=0;i<items.length;i++){

        items[i].className = "song-item";

        if(i === current){

            items[i].className = "song-item active";
        }
    }
}



function showToast(text){

    var toast = document.getElementById("toast");

    toast.innerHTML = text;

    toast.className = "show";

    setTimeout(function(){

        toast.className = "";

    },2000);
}



audio.onended = function(){

    next();
};



buildSongList();

loadSong(0);
