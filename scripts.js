// scripts.js

function filterSelection(c) {
    var cards = document.getElementsByClassName("filterDiv");
    for (var i = 0; i < cards.length; i++) {
        var coincide = c === "all" || cards[i].classList.contains(c);
        cards[i].classList.toggle("show", coincide);
    }
}

var btnContainer = document.querySelector(".tabs");
var btns = btnContainer ? btnContainer.getElementsByClassName("tab-button") : [];
for (var i = 0; i < btns.length; i++) {
    btns[i].addEventListener("click", function(){
        var current = document.getElementsByClassName("active");
        if (current.length > 0) {
            current[0].className = current[0].className.replace(" active", "");
        }
        this.className += " active";
    });
}
