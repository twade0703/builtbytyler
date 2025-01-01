
//Aero title 
swent = document.getElementById('dynamicTitle');
document.querySitch
const titleElement = document.getElementById('dynamicTitle');
document.querySelectorAll('.Links').forEach(link => {
    link.addEventListener('click', function () {
        const newTitle = this.getAttribute('data-title');
        if (newTitle) {
            titleElement.textContent = newTitle; // Update title dynamically
        }
    });
});


//Aero buttons
document.addEventListener('DOMContentLoaded', function () {
    const aeroContainer = document.getElementById('aeroContainer'); // Target the container
    const aeroButtons = document.querySelectorAll('.Links'); // Select all buttons with class 'Links'

    aeroButtons.forEach(button => {
        button.addEventListener('click', function (event) {
            event.preventDefault(); // Prevent default link behavior
            
            // Remove 'active' class from all buttons
            aeroButtons.forEach(btn => btn.classList.remove('active'));
            
            // Add 'active' class to the clicked button
            this.classList.add('active');
            
            // Update the container background
            const newBackground = this.getAttribute('data-bg');
            if (newBackground) {
                aeroContainer.style.backgroundImage = `url('${newBackground}')`;
                console.log(`Background changed to: ${newBackground}`); // Debug log
            }
        });
    });
});

//skills switch
document.addEventListener('DOMContentLoaded', function () {
    const skillContainer = document.getElementById('skillcontainer'); // Target the container
    const skillButtons = document.querySelectorAll('.skill'); // Select all skill buttons

    skillButtons.forEach(button => {
        button.addEventListener('click', function (event) {
            event.preventDefault(); // Prevent default link behavior
            const newBackground = this.getAttribute('data-bg'); // Get the background URL from data-bg
            if (newBackground) {
                skillContainer.style.backgroundImage = `url('${newBackground}')`; // Update the background image
                console.log(`Background changed to: ${newBackground}`); // Debug log
            }
        });
    });
});

//Skills Title
document.addEventListener('DOMContentLoaded', function () {
    const titleElement = document.getElementById('dynamicTitle'); // Target the title
    const skillButtons = document.querySelectorAll('.skill'); // Select all skill buttons

    skillButtons.forEach(button => {
        button.addEventListener('click', function (event) {
            event.preventDefault(); // Prevent default link behavior
            const newTitle = this.getAttribute('data-title'); // Get the title from the data-title attribute
            if (newTitle) {
                titleElement.textContent = newTitle; // Update the title text
                console.log(`Title updated to: ${newTitle}`); // Debug log for confirmation
            }
        });
    });
});

//Skills buttons
document.addEventListener('DOMContentLoaded', function () {
    const skillContainer = document.getElementById('skillcontainer'); // Target the container
    const skillButtons = document.querySelectorAll('.skill'); // Select all skill buttons

    skillButtons.forEach(button => {
        button.addEventListener('click', function (event) {
            event.preventDefault(); // Prevent default link behavior
            
            // Remove 'active' class from all buttons
            skillButtons.forEach(btn => btn.classList.remove('active'));
            
            // Add 'active' class to the clicked button
            this.classList.add('active');
            
            // Update the container background
            const newBackground = this.getAttribute('data-bg');
            if (newBackground) {
                skillContainer.style.backgroundImage = `url('${newBackground}')`;
                console.log(`Background changed to: ${newBackground}`); // Debug log
            }
        });
    });
});