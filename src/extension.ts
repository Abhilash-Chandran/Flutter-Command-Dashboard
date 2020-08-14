// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

import { dartCodeExtensionIdentifier, flutterExtensionIdentifier } from "./constants";

import { readFileSync } from 'fs';
import * as path from 'path';
import { env } from 'process';


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext): Promise<void> {

	// Ensure that dart and flutter extension are available and activated.
	const dartExt = vscode.extensions.getExtension(dartCodeExtensionIdentifier);
	const flutterExt = vscode.extensions.getExtension(flutterExtensionIdentifier);
	if (!dartExt) {
		// This should not happen since the Flutter-command extension has a dependency on the Dart extension
		// but just in case, we'd like to give a useful error message.
		throw new Error("The Dart extension is not installed, Flutter-Command extension is unable to activate.");
	}
	if (!flutterExt) {
		// This should not happen since the Flutter-command extension has a dependency on the flutter extension
		// but just in case, we'd like to give a useful error message.		
		throw new Error("The Flutter extension is not installed, Flutter-Command extension is unable to activate.");
	}

	// wait till the both flutter and dart extensions are active
	await dartExt.activate();
	await flutterExt.activate();
	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	let disposable = vscode.commands.registerCommand('flutter-command-dashboard.fc_dashboard', async () => {
		await CommandsDashboardPanel.createOrShow(context.extensionUri);
	});

	context.subscriptions.push(disposable);


	// Revive the dashboard if user reopened the window
	if (vscode.window.registerWebviewPanelSerializer) {
		// Make sure we register a serializer in activation event
		vscode.window.registerWebviewPanelSerializer(CommandsDashboardPanel.viewType, {
			async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any) {
				console.log(`Got state: ${state}`);
				await CommandsDashboardPanel.revive(webviewPanel, context.extensionUri);
			}
		});
	}
}

// this method is called when your extension is deactivated
export function deactivate() { }


class CommandsDashboardPanel {

	public static currentDashboardPanel: CommandsDashboardPanel | undefined;


	public static readonly viewType = 'commandDashPanel';

	private readonly _panel: vscode.WebviewPanel;

	private readonly _extensionUri: vscode.Uri;

	private _disposables: vscode.Disposable[] = [];

	public static async createOrShow(extensionUri: vscode.Uri) {
		const column = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined;

		// If we already have a panel, show it.
		if (CommandsDashboardPanel.currentDashboardPanel) {
			CommandsDashboardPanel.currentDashboardPanel._panel.reveal(column);
			return;
		}

		// Otherwise, create a new panel.
		const panel = vscode.window.createWebviewPanel(
			CommandsDashboardPanel.viewType,
			'Flutter Command Dashboard',
			vscode.ViewColumn.Two,
			{
				// Enable javascript in the webview
				enableScripts: true,

				// And restrict the webview to only loading content from our extension's `media` directory.
				localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'scripts'), vscode.Uri.joinPath(extensionUri, 'styles')]
			}
		);



		CommandsDashboardPanel.currentDashboardPanel = new CommandsDashboardPanel(panel, extensionUri);

		await CommandsDashboardPanel.refreshDashboard();
	}


	private static async refreshDashboard() {
		try {
			const response = await vscode.commands.executeCommand<(vscode.SymbolInformation | vscode.DocumentSymbol)[]>('vscode.executeWorkspaceSymbolProvider', '#Command');
			if (response) {
				const filtered = response.filter((elem: vscode.SymbolInformation | vscode.DocumentSymbol) => elem.name === 'Command' && elem.kind === vscode.SymbolKind.Class);

				if (filtered[0] instanceof vscode.SymbolInformation) {
					const docSymbols = await vscode.commands.executeCommand<(vscode.SymbolInformation | vscode.DocumentSymbol)[]>('vscode.executeDocumentSymbolProvider', filtered[0].location.uri);
					const commandSymbol = docSymbols?.find((elem: vscode.SymbolInformation | vscode.DocumentSymbol) => elem.name === 'Command' && elem.kind === vscode.SymbolKind.Class);
					if (commandSymbol instanceof vscode.SymbolInformation) {
						;

						const commandRefs = await vscode.commands.executeCommand<vscode.Location[]>('vscode.executeReferenceProvider', commandSymbol.location.uri, new vscode.Position(
							commandSymbol.location.range.start.line,
							commandSymbol.location.range.start.character
						));
						if (commandRefs) {
							const rootPath = vscode.workspace.workspaceFolders ? vscode?.workspace?.workspaceFolders[0].uri.path : '';
							const filteredRefs: vscode.Location[] = commandRefs.filter((elem) => elem.uri.path.endsWith('.dart') && elem.uri.path.toLowerCase().includes(rootPath.toLowerCase()));
							const commandVariables: (string | undefined)[] = [];
							const subRefNames = [];
							for (var ref of filteredRefs) {
								const textDoc: vscode.TextDocument = await vscode.workspace.openTextDocument(ref.uri);
								const parentBaseName = path.basename(ref.uri.path);
								// ensure to ignore command Creation
								let newRange: vscode.Range = ref.range.with(ref.range.start, new vscode.Position(ref.range.end.line, ref.range.end.character + 7));
								let textLine = textDoc.getText(newRange);
								if (textLine === 'Command.create') {
									continue;
								}
								//TODO: replace the random end range with some valid logic.
								newRange = ref.range.with(ref.range.end, new vscode.Position(ref.range.start.line, 500));
								textLine = textDoc.getText(newRange);
								let commandVariable = textLine?.match(/(?<=\>\s)(.*?)(?=\;)/g)?.pop();
								if (!commandVariable) {
									commandVariable = textLine?.match(/(?<=\>\s)(.*?)(?=\s\=)/g)?.pop() || '';
								}
								const subRefs = await vscode.commands.executeCommand<vscode.Location[]>('vscode.executeReferenceProvider', ref.uri, textDoc.positionAt(textDoc.getText().indexOf(commandVariable)));
								if (subRefs && commandVariable) {
									const filteredSubRefs: vscode.Location[] = subRefs.filter((elem) => elem.uri.path.endsWith('.dart') && elem.uri.path.toLowerCase().includes(rootPath.toLowerCase()) && !elem.uri.path.toLowerCase().includes(parentBaseName.toLowerCase()));
									for (var fSubs of filteredSubRefs) {
										subRefNames.push({
											parent: commandVariable,
											name: path.basename(fSubs.uri.path),
										});
									}
								}
								commandVariables.push(commandVariable);

							}
							CommandsDashboardPanel.currentDashboardPanel?.postMessage({ mainRefs: commandVariables, subRefs: subRefNames });

						}
					}
				}
			}
		} catch (error) {
			console.log('Error occurred while finding references.')
		}

	}

	public static async revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		CommandsDashboardPanel.currentDashboardPanel = new CommandsDashboardPanel(panel, extensionUri);
		await CommandsDashboardPanel.refreshDashboard();
	}


	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {

		this._panel = panel;
		this._extensionUri = extensionUri;



		// Set the webview's initial html content 
		// this is basically the flutter web output but inlined as text in this file.
		this._panel.webview.html = this._getHtmlForWebview();



		// Listen for when the panel is disposed
		// This happens when the user closes the panel or when the panel is closed programmatically
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);



		// Handle messages from the webview
		this._panel.webview.onDidReceiveMessage(
			message => {
				switch (message.command) {
					case 'alert':
						vscode.window.showErrorMessage(message.text);
						return;
				}
			},
			null,
			this._disposables
		);

		// Register a series of workspace changes listeners
		vscode.workspace.onDidRenameFiles(async (e) => {
			await CommandsDashboardPanel.refreshDashboard();
		});
		vscode.workspace.onDidSaveTextDocument(async (e) => {
			await CommandsDashboardPanel.refreshDashboard();
		});
		vscode.workspace.onDidDeleteFiles(async (e) => {
			await CommandsDashboardPanel.refreshDashboard();
		});
	}
	public postMessage(message: any) {		
		this._panel.webview.postMessage(message);
	}


	public dispose() {
		CommandsDashboardPanel.currentDashboardPanel = undefined;

		// Clean up our resources
		this._panel.dispose();

		while (this._disposables.length) {
			const x = this._disposables.pop();
			if (x) {
				x.dispose();
			}
		}
	}

	private _getHtmlForWebview() {

		const scriptPathOnDisk = vscode.Uri.file(path.join(this._extensionUri.fsPath, 'scripts', 'main.js'));
		const scriptUri = this._panel.webview.asWebviewUri(scriptPathOnDisk);

		const cyScriptPathOnDisk = vscode.Uri.file(path.join(this._extensionUri.fsPath, 'scripts', 'cytoscape.min.js'));
		const cyScriptUri = this._panel.webview.asWebviewUri(cyScriptPathOnDisk);

		const cyDagreScriptPathOnDisk = vscode.Uri.file(path.join(this._extensionUri.fsPath, 'scripts', 'cytoscape-dagre.js'));
		const cyDagreScriptUri = this._panel.webview.asWebviewUri(cyDagreScriptPathOnDisk);

		const mainCssPathOnDisk = vscode.Uri.file(path.join(this._extensionUri.fsPath, 'styles', 'main.css'));
		const mainCssUri = this._panel.webview.asWebviewUri(mainCssPathOnDisk);

		// Use a nonce to whitelist which scripts and style sheets
		const nonce = getNonce();

		return `
			<!DOCTYPE html>
			<html>
			<head>
				<meta charset="UTF-8">
				<meta content="IE=Edge" http-equiv="X-UA-Compatible">
			
				<!-- Content Security Policy 			
					Use a content security policy to only allow loading images from https or from our extension directory,
						and only allow scripts that have a specific nonce.
					-->
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${this._panel.webview.cspSource} https:; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}';">				
				<title>fc_dashboard_view</title>						
				<link nonce="${nonce}" rel="stylesheet" type="text/css" href="${mainCssUri}">
				<script nonce="${nonce}" src="${cyScriptUri}"></script>	
				<script nonce="${nonce}" src="${cyDagreScriptUri}"></script>			
			</head>
			<body>
				<noscript>You need to enable JavaScript to run this app.</noscript>
				<h1>Flutter Command Dashboard</h1>
				<div id="root">
					<div class="parent white">
						<div class="box green" id="depGraph"/>						
					</div>
				</div>								
				<script nonce="${nonce}" src="${scriptUri}"></script>				
			</body>
			</html>			
			`;
	}

}

function getNonce() {
	let text = "";
	const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}