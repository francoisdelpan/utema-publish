import { ButtonComponent, Modal, Setting, TextComponent } from "obsidian";

export class CommitModal extends Modal {
  private readonly onSubmit: (message: string) => void;
  private input?: TextComponent;
  private publishButton?: ButtonComponent;

  constructor(
    app: Modal["app"],
    onSubmit: (message: string) => void,
  ) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl, titleEl } = this;
    titleEl.setText("UTEMA Publish");
    contentEl.addClass("utema-publish-modal");

    let commitMessage = "";

    new Setting(contentEl)
      .setName("Commit message")
      .setDesc("Message obligatoire avant publication.")
      .addText((text) => {
        this.input = text;
        text.inputEl.placeholder = "Ex. Publish notes";
        text.inputEl.focus();
        text.inputEl.addEventListener("keydown", (event: KeyboardEvent) => {
          if (event.key === "Enter") {
            event.preventDefault();
            this.submit(commitMessage);
          }
        });
        text.onChange((value) => {
          commitMessage = value.trim();
          this.publishButton?.setDisabled(commitMessage.length === 0);
        });
      });

    new Setting(contentEl)
      .addButton((button) => {
        button.setButtonText("Publier");
        button.setCta();
        button.setDisabled(true);
        button.onClick(() => this.submit(commitMessage));
        this.publishButton = button;
      })
      .addButton((button) => {
        button.setButtonText("Annuler");
        button.onClick(() => this.close());
      });
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private submit(message: string): void {
    const normalizedMessage = message.trim();
    if (!normalizedMessage) {
      this.input?.inputEl.focus();
      return;
    }

    this.close();
    this.onSubmit(normalizedMessage);
  }
}
