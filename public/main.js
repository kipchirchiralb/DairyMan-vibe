// Simple JavaScript for header scroll effect
window.addEventListener("scroll", function () {
  const header = document.querySelector("header");
  if (window.scrollY > 50) {
    header.style.boxShadow = "0 2px 10px rgba(0,0,0,0.1)";
  } else {
    header.style.boxShadow = "none";
  }
});

// Mobile navigation functionality
document.addEventListener("DOMContentLoaded", function () {
  const mobileMenuToggle = document.getElementById("mobileMenuToggle");
  const mobileNavOverlay = document.getElementById("mobileNavOverlay");
  const mobileNavClose = document.getElementById("mobileNavClose");
  const mobileNav = document.getElementById("mobileNav");
  const body = document.body;

  // Open mobile menu
  if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener("click", function () {
      mobileNavOverlay.classList.add("active");
      body.style.overflow = "hidden"; // Prevent background scrolling
    });
  }

  // Close mobile menu
  function closeMobileMenu() {
    mobileNavOverlay.classList.remove("active");
    body.style.overflow = ""; // Restore scrolling
  }

  if (mobileNavClose) {
    mobileNavClose.addEventListener("click", closeMobileMenu);
  }

  // Close menu when clicking overlay
  if (mobileNavOverlay) {
    mobileNavOverlay.addEventListener("click", function (e) {
      if (e.target === mobileNavOverlay) {
        closeMobileMenu();
      }
    });
  }

  // Close menu when clicking on navigation links
  const mobileNavLinks = document.querySelectorAll(".mobile-nav-link");
  mobileNavLinks.forEach((link) => {
    link.addEventListener("click", function () {
      // For anchor links, close menu after a short delay
      if (this.getAttribute("href").startsWith("#")) {
        setTimeout(closeMobileMenu, 300);
      } else {
        closeMobileMenu();
      }
    });
  });

  // Close menu on escape key
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && mobileNavOverlay.classList.contains("active")) {
      closeMobileMenu();
    }
  });

  // Handle window resize
  window.addEventListener("resize", function () {
    if (
      window.innerWidth > 768 &&
      mobileNavOverlay.classList.contains("active")
    ) {
      closeMobileMenu();
    }
  });
});

// Smooth scrolling for navigation links
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener("click", function (e) {
    e.preventDefault();

    const targetId = this.getAttribute("href");
    if (targetId === "#register" || targetId === "#login") {
      // For demo purposes, just alert
      alert(
        "This would open the " +
          targetId.substring(1) +
          " form in a real implementation."
      );
      return;
    }

    const targetElement = document.querySelector(targetId);
    if (targetElement) {
      window.scrollTo({
        top: targetElement.offsetTop - 80,
        behavior: "smooth",
      });
    }
  });
});
