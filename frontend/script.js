document.addEventListener("DOMContentLoaded", () => {

    const courses = [
        { id: 1, title: "Web Development", desc: "HTML, CSS, JS", key: "enrolled_web" },
        { id: 2, title: "Machine Learning", desc: "Coming Soon", state: "future" }
    ];

    const panel = document.getElementById("coursePanel");
    const panelTitle = document.getElementById("panelTitle");
    const panelDesc = document.getElementById("panelDesc");
    const enrollBtn = document.getElementById("enrollBtn");

    function openPanel(course) {
        panelTitle.textContent = course.title;
        panelDesc.textContent = course.desc;

        const enrolled = localStorage.getItem(course.key) === "true";

        if (enrolled) {
            enrollBtn.textContent = "Start Course";
            enrollBtn.onclick = e => {
                e.preventDefault();
                window.location.href = "ok.html";
            };
        } else {
            enrollBtn.textContent = "Enroll • Free";
            enrollBtn.onclick = e => {
                e.preventDefault();

                if (localStorage.getItem("isLoggedIn") !== "true") {
                    localStorage.setItem("afterLogin", "courses.html");
                    window.location.href = "login.html";
                } else {
                    window.location.href = "ok.html";
                }
            };
        }

        panel.classList.add("open");
    }

    document.querySelectorAll(".open-course").forEach(btn => {
        btn.addEventListener("click", e => {
            const id = Number(e.target.closest(".course-card").dataset.id);
            const course = courses.find(c => c.id === id);
            openPanel(course);
        });
    });

});
