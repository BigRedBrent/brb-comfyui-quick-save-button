import { app } from "../../scripts/app.js";

const BUTTON_ID = "quick-save-button";

// Green only while there are unsaved changes; otherwise the button uses the theme's normal colors.
const COLOR_UNSAVED = "#2e7d32";
const COLOR_UNSAVED_TEXT = "#ffffff";

function findButtonByText(text) {
    const buttons = document.querySelectorAll("button");
    for (const button of buttons) {
        if (button.id === BUTTON_ID) {
            continue;
        }
        if (button.textContent.trim() === text) {
            return button;
        }
    }
    return null;
}

function outermostWrapper(button) {
    // Walk up through everything that belongs only to this button (such as the Graph menu's clickable area),
    // stopping where its neighboring buttons are, so the Save button is placed outside it, not inside.
    let element = button;
    while (element.parentElement) {
        const neighbors = Array.from(element.parentElement.querySelectorAll("button")).filter(
            (other) => other.id !== BUTTON_ID && !element.contains(other)
        );
        if (neighbors.length > 0) {
            break;
        }
        element = element.parentElement;
    }
    return element;
}

function keepClickToItself(event) {
    // Stop the click from reaching anything around the button, such as the Graph menu.
    event.stopPropagation();
}

function hasUnsavedChanges() {
    // Ask ComfyUI's workflow store, the same value the tab's unsaved dot is drawn from.
    try {
        const workflow = app.extensionManager?.workflow?.activeWorkflow;
        if (workflow && typeof workflow.isModified === "boolean") {
            return workflow.isModified;
        }
    } catch (error) {
        // Treated as unknown below.
    }
    return null;
}

function updateColor() {
    const button = document.getElementById(BUTTON_ID);
    if (!button) {
        return;
    }
    const unsaved = hasUnsavedChanges();
    if (unsaved === true) {
        button.style.backgroundColor = COLOR_UNSAVED;
        button.style.color = COLOR_UNSAVED_TEXT;
        button.title = "Save workflow (unsaved changes)";
        return;
    }
    // Saved, or status unknown: use the theme's normal button colors.
    button.style.backgroundColor = "";
    button.style.color = "";
    button.title = unsaved === false ? "Save workflow (all changes saved)" : "Save workflow (save status unknown)";
}

async function saveWorkflow() {
    try {
        await app.extensionManager.command.execute("Comfy.SaveWorkflow");
    } catch (error) {
        console.error("[Quick Save] Save failed:", error);
    }
    updateColor();
}

// Outline floppy-disk icon, drawn in the button's text color. Used only if ComfyUI's own icon isn't available.
const FALLBACK_ICON_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>' +
    '<polyline points="17 21 17 13 7 13 7 21"/>' +
    '<polyline points="7 3 7 8 15 8"/>' +
    "</svg>";

function createButton(template) {
    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.className = template.className;
    button.title = "Save workflow";
    button.style.margin = "0 4px";
    button.style.display = "inline-flex";
    button.style.alignItems = "center";
    button.style.gap = "6px";

    // The same outline save icon ComfyUI uses in its menus; it takes the button's text color.
    const icon = document.createElement("i");
    icon.className = "pi pi-save";
    icon.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.textContent = "Save";

    button.appendChild(icon);
    button.appendChild(label);
    button.addEventListener("pointerdown", keepClickToItself);
    button.addEventListener("mousedown", keepClickToItself);
    button.addEventListener("click", (event) => {
        keepClickToItself(event);
        event.preventDefault();
        saveWorkflow();
    });
    return button;
}

function useFallbackIconIfNeeded(button) {
    // If ComfyUI's icon font didn't draw anything, swap in an equivalent outline icon.
    const icon = button.querySelector("i.pi-save");
    if (!icon) {
        return;
    }
    const content = getComputedStyle(icon, "::before").content;
    if (!content || content === "none" || content === "normal" || content === '""') {
        const fallback = document.createElement("span");
        fallback.style.display = "inline-flex";
        fallback.innerHTML = FALLBACK_ICON_SVG;
        icon.replaceWith(fallback);
    }
}

function placeAfter(button, neighbor) {
    // Put the Save button right after the neighbor button, which is the last one in its group.
    const anchor = outermostWrapper(neighbor);
    if (anchor.nextSibling !== button) {
        anchor.parentElement.insertBefore(button, anchor.nextSibling);
    }
}

function placeBefore(button, neighbor) {
    const anchor = outermostWrapper(neighbor);
    if (anchor.previousSibling !== button) {
        anchor.parentElement.insertBefore(button, anchor);
    }
}

function lastButtonInGroup(modeButton) {
    // The group is the smallest box around the mode button that holds other buttons too.
    // Return the last button in it (other than Save), whatever its text.
    let element = modeButton.parentElement;
    while (element) {
        const buttons = Array.from(element.querySelectorAll("button")).filter((b) => b.id !== BUTTON_ID);
        if (buttons.length > 1) {
            return buttons[buttons.length - 1];
        }
        element = element.parentElement;
    }
    return modeButton;
}

function insertButton() {
    // Decide the spot fresh every time, so the button follows the current mode.
    // Find the mode button (Graph or App), then go after the last button in its group, whatever that is.
    // If there's no mode button: just to the left of Extensions.
    const modeButton = findButtonByText("Graph") || findButtonByText("App");
    let neighbor = modeButton ? lastButtonInGroup(modeButton) : null;
    let atEnd = true;
    if (!neighbor) {
        neighbor = findButtonByText("Extensions");
        atEnd = false;
    }
    if (!neighbor) {
        return;
    }

    let button = document.getElementById(BUTTON_ID);
    const isNew = !button;
    if (isNew) {
        button = createButton(neighbor);
    } else if (button.className !== neighbor.className) {
        // Match the style of the button it's beside.
        button.className = neighbor.className;
    }

    if (atEnd) {
        placeAfter(button, neighbor);
    } else {
        placeBefore(button, neighbor);
    }

    if (isNew) {
        useFallbackIconIfNeeded(button);
        updateColor();
    }
}

let scheduled = false;

function scheduleInsert() {
    if (scheduled) {
        return;
    }
    scheduled = true;
    requestAnimationFrame(() => {
        scheduled = false;
        insertButton();
    });
}

app.registerExtension({
    name: "QuickSaveButton",
    setup() {
        insertButton();
        // The toolbar can be rebuilt or restyled by the interface, so keep the button in step with it.
        const observer = new MutationObserver(scheduleInsert);
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ["class"],
        });
        // Check for unsaved changes twice a second and recolor the button.
        setInterval(updateColor, 500);
    },
});
