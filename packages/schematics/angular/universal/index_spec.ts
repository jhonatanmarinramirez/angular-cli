/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { JsonParseMode, parseJson } from '@angular-devkit/core';
import { SchematicTestRunner, UnitTestTree } from '@angular-devkit/schematics/testing';
import { Schema as ApplicationOptions, Style } from '../application/schema';
import { NodeDependencyType, addPackageJsonDependency } from '../utility/dependencies';
import { Schema as WorkspaceOptions } from '../workspace/schema';
import { Schema as UniversalOptions } from './schema';

// tslint:disable-next-line:no-big-function
describe('Universal Schematic', () => {
  const schematicRunner = new SchematicTestRunner(
    '@schematics/angular',
    require.resolve('../collection.json'),
  );
  const defaultOptions: UniversalOptions = {
    clientProject: 'bar',
  };
  const workspaceUniversalOptions: UniversalOptions = {
    clientProject: 'workspace',
  };

  const workspaceOptions: WorkspaceOptions = {
    name: 'workspace',
    newProjectRoot: 'projects',
    version: '6.0.0',
  };

  const appOptions: ApplicationOptions = {
    name: 'bar',
    inlineStyle: false,
    inlineTemplate: false,
    routing: false,
    style: Style.Css,
    skipTests: false,
    skipPackageJson: false,
  };

  const initialWorkspaceAppOptions: ApplicationOptions = {
    name: 'workspace',
    projectRoot: '',
    inlineStyle: false,
    inlineTemplate: false,
    routing: false,
    style: Style.Css,
    skipTests: false,
    skipPackageJson: false,
  };

  let appTree: UnitTestTree;

  beforeEach(async () => {
    appTree = await schematicRunner.runSchematicAsync('workspace', workspaceOptions).toPromise();
    appTree = await schematicRunner.runSchematicAsync(
      'application',
      initialWorkspaceAppOptions,
      appTree,
    ).toPromise();
    appTree = await schematicRunner.runSchematicAsync('application', appOptions, appTree)
      .toPromise();
  });

  it('should create a root module file', async () => {
    const tree = await schematicRunner.runSchematicAsync('universal', defaultOptions, appTree)
      .toPromise();
    const filePath = '/projects/bar/src/app/app.server.module.ts';
    expect(tree.exists(filePath)).toEqual(true);
  });

  it('should create a main file', async () => {
    const tree = await schematicRunner.runSchematicAsync('universal', defaultOptions, appTree)
      .toPromise();
    const filePath = '/projects/bar/src/main.server.ts';
    expect(tree.exists(filePath)).toEqual(true);
    const contents = tree.readContent(filePath);
    expect(contents).toMatch(/export { AppServerModule } from '\.\/app\/app\.server\.module'/);
  });

  it('should create a tsconfig file for the workspace project', async () => {
    const tree = await schematicRunner
      .runSchematicAsync('universal', workspaceUniversalOptions, appTree)
      .toPromise();
    const filePath = '/tsconfig.server.json';
    expect(tree.exists(filePath)).toEqual(true);
    // tslint:disable-next-line: no-any
    const contents = parseJson(tree.readContent(filePath).toString(), JsonParseMode.Loose) as any;
    expect(contents).toEqual({
      extends: './tsconfig.app.json',
      compilerOptions: {
        outDir: './out-tsc/server',
        target: 'es2016',
        types: ['node'],
      },
      files: [
        'src/main.server.ts',
      ],
      angularCompilerOptions: {
        entryModule: './src/app/app.server.module#AppServerModule',
      },
    });
    const angularConfig = JSON.parse(tree.readContent('angular.json'));
    expect(angularConfig.projects.workspace.architect
      .server.options.tsConfig).toEqual('tsconfig.server.json');
  });

  it('should create a tsconfig file for a generated application', async () => {
    const tree = await schematicRunner.runSchematicAsync('universal', defaultOptions, appTree)
      .toPromise();
    const filePath = '/projects/bar/tsconfig.server.json';
    expect(tree.exists(filePath)).toEqual(true);
    // tslint:disable-next-line: no-any
    const contents = parseJson(tree.readContent(filePath).toString(), JsonParseMode.Loose) as any;
    expect(contents).toEqual({
      extends: './tsconfig.app.json',
      compilerOptions: {
        outDir: '../../out-tsc/server',
        target: 'es2016',
        types: ['node'],
      },
      files: [
        'src/main.server.ts',
      ],
      angularCompilerOptions: {
        entryModule: './src/app/app.server.module#AppServerModule',
      },
    });
    const angularConfig = JSON.parse(tree.readContent('angular.json'));
    expect(angularConfig.projects.bar.architect
      .server.options.tsConfig).toEqual('projects/bar/tsconfig.server.json');
  });

  it('should add dependency: @angular/platform-server', async () => {
    const tree = await schematicRunner.runSchematicAsync('universal', defaultOptions, appTree)
      .toPromise();
    const filePath = '/package.json';
    const contents = tree.readContent(filePath);
    expect(contents).toMatch(/\"@angular\/platform-server\": \"/);
  });

  it('should update workspace with a server target', async () => {
    const tree = await schematicRunner.runSchematicAsync('universal', defaultOptions, appTree)
      .toPromise();
    const filePath = '/angular.json';
    const contents = tree.readContent(filePath);
    const config = JSON.parse(contents.toString());
    const targets = config.projects.bar.architect;
    expect(targets.server).toBeDefined();
    expect(targets.server.builder).toBeDefined();
    const opts = targets.server.options;
    expect(opts.outputPath).toEqual('dist/bar/server');
    expect(opts.main).toEqual('projects/bar/src/main.server.ts');
    expect(opts.tsConfig).toEqual('projects/bar/tsconfig.server.json');
    const configurations = targets.server.configurations;
    expect(configurations.production).toBeDefined();
    expect(configurations.production.fileReplacements).toBeDefined();
    expect(configurations.production.outputHashing).toBe('media');
    const fileReplacements = targets.server.configurations.production.fileReplacements;
    expect(fileReplacements.length).toEqual(1);
    expect(fileReplacements[0].replace).toEqual('projects/bar/src/environments/environment.ts');
    expect(fileReplacements[0].with).toEqual('projects/bar/src/environments/environment.prod.ts');
  });

  it('should update workspace with a build target outputPath', async () => {
    const tree = await schematicRunner.runSchematicAsync('universal', defaultOptions, appTree)
      .toPromise();
    const filePath = '/angular.json';
    const contents = tree.readContent(filePath);
    const config = JSON.parse(contents.toString());
    const targets = config.projects.bar.architect;
    expect(targets.build.options.outputPath).toEqual('dist/bar/browser');
  });

  it('should add a server transition to BrowerModule import', async () => {
    const tree = await schematicRunner.runSchematicAsync('universal', defaultOptions, appTree)
      .toPromise();
    const filePath = '/projects/bar/src/app/app.module.ts';
    const contents = tree.readContent(filePath);
    expect(contents).toMatch(/BrowserModule\.withServerTransition\({ appId: 'serverApp' }\)/);
  });

  it('should wrap the bootstrap call in a DOMContentLoaded event handler', async () => {
    const tree = await schematicRunner.runSchematicAsync('universal', defaultOptions, appTree)
      .toPromise();
    const filePath = '/projects/bar/src/main.ts';
    const contents = tree.readContent(filePath);
    expect(contents)
      .toMatch(/document.addEventListener\('DOMContentLoaded', \(\) => {/);
  });

  it('should wrap the bootstrap declaration in a DOMContentLoaded event handler', async () => {
    const filePath = '/projects/bar/src/main.ts';
    appTree.overwrite(
      filePath,
      `
      import { enableProdMode } from '@angular/core';
      import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
      import { AppModule } from './app/app.module';
      import { environment } from './environments/environment';
      import { hmrBootstrap } from './hmr';

      if (environment.production) {
        enableProdMode();
      }

      const bootstrap = () => platformBrowserDynamic().bootstrapModule(AppModule);

      if (!hmrBootstrap) {
        bootstrap().catch(err => console.log(err));
      }
      `,
    );

    const tree = await schematicRunner.runSchematicAsync('universal', defaultOptions, appTree)
      .toPromise();
    const contents = tree.readContent(filePath);
    expect(contents).toMatch(
      /document.addEventListener\('DOMContentLoaded', \(\) => {[\n\r\s]+bootstrap\(\)/,
    );
  });

  it('should install npm dependencies', async () => {
    await schematicRunner.runSchematicAsync('universal', defaultOptions, appTree).toPromise();
    expect(schematicRunner.tasks.length).toBe(1);
    expect(schematicRunner.tasks[0].name).toBe('node-package');
    expect((schematicRunner.tasks[0].options as {command: string}).command).toBe('install');
  });

  it(`should work when 'tsconfig.app.json' has comments`, async () => {
    const appTsConfigPath = '/projects/bar/tsconfig.app.json';
    const appTsConfigContent = appTree.readContent(appTsConfigPath);
    appTree.overwrite(appTsConfigPath, '// comment in json file\n' + appTsConfigContent);

    const tree = await schematicRunner.runSchematicAsync('universal', defaultOptions, appTree)
      .toPromise();

    const filePath = '/projects/bar/tsconfig.server.json';
    expect(tree.exists(filePath)).toEqual(true);
  });

  it(`should not add import to '@angular/localize' in main file when it's not a depedency`, async () => {
    const tree = await schematicRunner.runSchematicAsync('universal', defaultOptions, appTree)
      .toPromise();
    const filePath = '/projects/bar/src/main.server.ts';
    const contents = tree.readContent(filePath);
    expect(contents).not.toContain('@angular/localize');
  });

  it(`should add import to '@angular/localize' in main file when it's a depedency`, async () => {
    addPackageJsonDependency(appTree, {
       name: '@angular/localize',
       type: NodeDependencyType.Default,
       version: 'latest',
    });

    const tree = await schematicRunner.runSchematicAsync('universal', defaultOptions, appTree)
      .toPromise();
    const filePath = '/projects/bar/src/main.server.ts';
    const contents = tree.readContent(filePath);
    expect(contents).toContain('@angular/localize/init');
  });

  it('should add reference in solution style tsconfig', async () => {
    const tree = await schematicRunner.runSchematicAsync('universal', workspaceUniversalOptions, appTree)
      .toPromise();

    // tslint:disable-next-line:no-any
    const { references } = parseJson(tree.readContent('/tsconfig.json').toString(), JsonParseMode.Loose) as any;
    expect(references).toEqual([
      { path: './tsconfig.app.json' },
      { path: './tsconfig.spec.json' },
      { path: './e2e/tsconfig.json' },
      { path: './projects/bar/tsconfig.app.json' },
      { path: './projects/bar/tsconfig.spec.json' },
      { path: './projects/bar/e2e/tsconfig.json' },
      { path: './tsconfig.server.json' },
    ]);
  });
});
