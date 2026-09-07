import { Plugin } from "obsidian";
import { TableStateManager } from "./core/table-state";
import {
  TABLE_CODE_BLOCK_LANGUAGES,
  TableCodeBlockProcessor,
} from "./extensions/codeblock-processor";
import { TablePostProcessor } from "./extensions/post-processor";
import { CommandService } from "./services/command-service";
import { SettingsService } from "./services/settings-service";
import { TableSyncService } from "./services/table-sync-service";
import { TableViewController } from "./services/table-view-controller";
import { TableViewRegistry } from "./services/table-view-registry";
import { VaultService } from "./services/vault-service";
import { closeAllFloatingPopovers } from "./ui/popover";
import { TableBaseSettingTab } from "./ui/settings-tab";

export default class TableBasePlugin extends Plugin {
  private settingsService!: SettingsService;
  private viewRegistry!: TableViewRegistry;

  override async onload(): Promise<void> {
    this.settingsService = new SettingsService({
      loadData: () => this.loadData(),
      saveData: (data) => this.saveData(data),
    });
    await this.settingsService.loadSettings();

    this.viewRegistry = new TableViewRegistry();
    this.register(() => this.viewRegistry.dispose());

    const vaultService = new VaultService(this.app);
    const syncService = new TableSyncService(vaultService);
    const stateManager = new TableStateManager();
    const viewController = new TableViewController(
      this.app,
      this.settingsService,
      stateManager,
      syncService
    );

    new CommandService(this).registerCommands();

    const postProcessor = new TablePostProcessor(viewController, this.viewRegistry);
    this.registerMarkdownPostProcessor((el, ctx) => postProcessor.process(el, ctx));

    const codeBlockProcessor = new TableCodeBlockProcessor(viewController, this.viewRegistry);
    for (const language of TABLE_CODE_BLOCK_LANGUAGES) {
      this.registerMarkdownCodeBlockProcessor(language, (source, el, ctx) =>
        codeBlockProcessor.process(source, el, ctx)
      );
    }

    this.addSettingTab(new TableBaseSettingTab(this.app, this, this.settingsService));
  }

  override onunload(): void {
    closeAllFloatingPopovers();
    this.viewRegistry?.dispose();
  }
}
