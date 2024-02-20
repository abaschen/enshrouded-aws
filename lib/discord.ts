import { CfnOutput, Duration, RemovalPolicy, SecretValue, Stack, StackProps } from "aws-cdk-lib";
import { LambdaIntegration, MethodLoggingLevel, RestApi, SecurityPolicy } from "aws-cdk-lib/aws-apigateway";

import { NodetsFunction, NodetsFunctionProps } from '@aws-abaschen/cdk-typescript';
import { Certificate, CertificateValidation } from "aws-cdk-lib/aws-certificatemanager";
import { Metric } from "aws-cdk-lib/aws-cloudwatch";
import { Authorization, Connection } from "aws-cdk-lib/aws-events";
import { ManagedPolicy, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { S3EventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import { ARecord, IHostedZone, RecordTarget } from "aws-cdk-lib/aws-route53";
import { ApiGateway } from "aws-cdk-lib/aws-route53-targets";
import { BlockPublicAccess, Bucket, EventType, NotificationKeyFilter, ObjectOwnership } from "aws-cdk-lib/aws-s3";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import { StringParameter } from "aws-cdk-lib/aws-ssm";
import { DefinitionBody, StateMachine } from "aws-cdk-lib/aws-stepfunctions";
import { Construct } from "constructs";
import { SourceMapMode } from "aws-cdk-lib/aws-lambda-nodejs";

export interface DiscordStackProps extends StackProps {
    hostedZone: IHostedZone
}

export class DiscordStack extends Stack {

    constructor(scope: Construct, id: string, props: DiscordStackProps) {
        super(scope, id, props);
        
        const lambdaDefault: Partial<NodetsFunctionProps> = {
            timeout: Duration.minutes(1),
            bundling: {
                sourceMap: false,
                minify: true
            }
        };

        new Metric({
            namespace: 'AWS/Route53',
            metricName: 'DNSQueries',
            dimensionsMap: {
                HostedZoneId: props.hostedZone.hostedZoneId
            },
        });
        const domainName = `bot.${props.hostedZone.zoneName}`
        const certificate = new Certificate(this, `discord-domain-crt`, {
            domainName,
            validation: CertificateValidation.fromDns(props.hostedZone),
            certificateName: domainName,
            subjectAlternativeNames: [domainName],
        });

        const api = new RestApi(this, 'chatbot', {
            deployOptions: {
                dataTraceEnabled: true,
                loggingLevel: MethodLoggingLevel.INFO,
                metricsEnabled: true,
                tracingEnabled: true,
            },
            domainName: {
                certificate,
                domainName,
                securityPolicy: SecurityPolicy.TLS_1_2
            }
        });

        new CfnOutput(this, 'domain-name-alias-domain-name', {
            value: domainName,
            description: 'alias domain name of the domain name',
            exportName: 'domainNameAliasDomainName',
        });

        const endpoint = api.root.addResource('discord');      // represents the root resource of the API endpoint
        endpoint.addCorsPreflight({
            allowOrigins: ['discord.com', 'discordapi.com'],
            allowMethods: ["POST"] // this is also the default
        })

        //S3 Bucket for discord description
        const s3Bucket = new Bucket(this, 'discordCommandsDefinition', {
            bucketName: `discord-configuration-${this.account}`,
            objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
            blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
            autoDeleteObjects: true,
            removalPolicy: RemovalPolicy.DESTROY
        });

        // const discordSecret = Secret.fromSecretNameV2(this, 'discordClientId', 'discord/ensh');
        // const registerDiscordCommands = new NodetsFunction(this, 'registerDiscordCommands', {
        //     ...lambdaDefault,
        //     entry: 'src/functions/register-commands/index.ts',
        //     functionName: 'RegisterDiscordCommands',
        //     environment: {
        //         COMMAND_BUCKET: s3Bucket.bucketArn,
        //         DISCORD_AUTH_SECRET: discordSecret.secretName
        //     }
        // });

        const filter: NotificationKeyFilter = { suffix: 'commands.json' };
        // listen to bucket object event put
        const s3PutEventSource = new S3EventSource(s3Bucket, {
            events: [
                EventType.OBJECT_CREATED_PUT
            ],
            filters: [filter]
        });

        //registerDiscordCommands.lambda.addEventSource(s3PutEventSource);


        const apiGatewayExecuteRole = new Role(this, `APIGateway-ExecuteLambda`, {
            assumedBy: new ServicePrincipal('apigateway.amazonaws.com'),
        });
        if (!process.env.DISCORD_PUBKEY) {
            console.error("DISCORD_PUBKEY not set")
            process.exit(4);
        }
        const param = new StringParameter(this, 'discord-public-key', {
            parameterName: 'integration-discord-public-key',
            stringValue: process.env.DISCORD_PUBKEY
        });

        const stateMachineLogs = new LogGroup(this, 'discordCommandStateMachineLogGroup', {
            logGroupName: '/aws/vendedlogs/states/discordCommandStateMachine',
            retention: RetentionDays.ONE_MONTH,
            removalPolicy: RemovalPolicy.DESTROY,
        });

        if (!process.env.DISCORD_API_TOKEN) {
            console.error("DISCORD_API_TOKEN not set")
            process.exit(3);
        }
        const apiTokenSecret = new Secret(this, 'discordApiSecret', {
            secretName: 'discordApiToken',
            secretStringValue: SecretValue.unsafePlainText(process.env.DISCORD_API_TOKEN)
        })
        new Connection(this, 'DiscordConnection', {
            authorization: Authorization.apiKey('discord', apiTokenSecret.secretValue),
            description: 'Discord connection'
        })



        const fnQuery = new NodetsFunction(this, 'query', {
            ...lambdaDefault,
            description: 'Query Server',
            entry: 'src/functions/query/index.ts'
        });

        if (!process.env.INSTANCE_ID) {
            throw new Error("INSTANCE_ID not set")
        }
        if(!process.env.EC2_PUBLIC_IP){
            throw new Error("EC2_PUBLIC_IP is not defined")
          }
        const instanceId: string = process.env.INSTANCE_ID;
        const publicIp: string = process.env.EC2_PUBLIC_IP;

        new ARecord(this, 'discord-api-record', {
            zone: props.hostedZone,
            recordName: 'bot',
            target: RecordTarget.fromAlias(new ApiGateway(api)),
        }).applyRemovalPolicy(RemovalPolicy.DESTROY);

        new ARecord(this, 'discord-alias-record', {
            zone: props.hostedZone,
            recordName: 'ensh',
            target: RecordTarget.fromIpAddresses(publicIp),
        }).applyRemovalPolicy(RemovalPolicy.DESTROY);

        const stateMachineRole = new Role(this, 'discordCommandStateMachineRole', {
            assumedBy: new ServicePrincipal('states.amazonaws.com'),
            managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaRole')],
            inlinePolicies: {
                'describe-ec2': new PolicyDocument({
                    statements: [
                        new PolicyStatement({
                            actions: ['ec2:DescribeInstances'],
                            resources: [`*`]
                        }),
                    ]
                }),
                'start-stop-ec2':new PolicyDocument({
                    statements: [
                        new PolicyStatement({
                            actions: ['ec2:StartInstances', 'ec2:StopInstances', 'ec2:RebootInstances'],
                            resources: [`arn:aws:ec2:${this.region}:${this.account}:instance/${instanceId}`]
                        }),
                    ]
                }),
            }
        });

        const sendMessage = new NodetsFunction(this, 'sendMessage', {
            ...lambdaDefault,
            description: 'Send message to discord',
            entry: 'src/functions/sendMessage/index.ts',
            timeout: Duration.minutes(1),
            environment: {
                WEBHOOK_ID: process.env.WEBHOOK_ID || '',
                WEBHOOK_TOKEN:  process.env.WEBHOOK_TOKEN || ''
            }
        })
        const stateMachine = new StateMachine(this, 'discordCommandStateMachine', {
            logs: {
                destination: stateMachineLogs
            },
            role: stateMachineRole,
            definitionBody: DefinitionBody.fromFile('lib/state-machine.json'),
            definitionSubstitutions: {
                host: `ensh.${props.hostedZone.zoneName}`,
                instanceId,
                queryFn: fnQuery.lambda.functionArn,
                sendMessageFn: sendMessage.lambda.functionArn
                // discordConnectionArn: "arn:aws:events:eu-west-1:337366777972:connection/Discord/5edcbbe7-d486-4dc3-9247-4f143fa3b856",
                // discordApiEndpoint: "https://bot.test.baschen.is"
            }
        })

        const fnAuthorize = new NodetsFunction(this, 'authorize', {
            ...lambdaDefault,
            description: 'API gateway invoke this lambda when receiving interaction',
            entry: 'src/functions/authorize/index.ts',
            //discord timeout
            timeout: Duration.seconds(3),
            environment: {
                //todo add to secret manager
                APP_PUBLIC_KEY: param.stringValue,
                STATE_MACHINE_ARN: stateMachine.stateMachineArn
            }
        });


        // ///// Back channel

        // this.fnRespondToDiscord = new NodetsFunction(this, 'fnSendResponseToDiscord', {
        //     ...this.lambdaDefault,
        //     functionName: 'SendResponseToDiscord',
        //     role: this.createLambdaRole('SendResponseToDiscord'),
        //     description: 'Poll pending responses to send it to discord webhook',
        //     entry: 'functions/fn-respond-to-discord/index.ts',
        //     onFailure: new SqsDestination(createDeadletter(this, 'send-response-to-discord-lambda-failure').queue)
        // });

        // this.sendToDiscordQueue = createSqs(this, 'send-response-to-discord', {
        // });

        // const failedCommandHandlerQueue: DeadLetterQueue = createDeadletter(this, 'CommandHandler');

        // this.commands = {};
        // const fnCommandsCustomProps: {
        //     [key: string]: {
        //         onCreate?: Function,
        //         props: NodetsFunctionProps
        //     }
        // } = {
        //     example: {
        //         props: {
        //             ...this.lambdaDefault,

        //         }
        //     },
        //     settings: {
        //         onCreate: () => dbSecret!.grantRead(this.commands.settings),
        //         props: {
        //             ...this.lambdaDefault,
        //             vpcSubnets: { subnets: [...vpc.isolatedSubnets, ...vpc.privateSubnets] },
        //             environment: {
        //                 databaseSecretArn: dbSecret!.secretArn
        //             },
        //             bundling: {
        //                 ...this.lambdaDefault.bundling,
        //                 externalModules: ['aws-sdk', 'pg-native']
        //             }
        //         }
        //     }
        // }


        // readdirSync('functions/discord/commands', { withFileTypes: true })
        //     .filter(dirent => dirent.isDirectory())
        //     .map(dirent => dirent.name)
        //     .map(name => {
        //         const custom = fnCommandsCustomProps[name];
        //         const lambdaProps = custom?.props ?? { ...this.lambdaDefault };
        //         const onCreate = custom?.onCreate;
        //         const fn = new NodetsFunction(this, `fn-discord-command-${name}-queue`, {
        //             ...lambdaProps,
        //             entry: `functions/discord/commands/${name}/index.ts`,
        //             description: `Discord '${name}' command handler`,
        //             functionName: `fn-discord-command-${name}-queue`,
        //             role: this.createLambdaRole(`DiscordCommand${name}`),
        //             onSuccess: new SqsDestination(this.sendToDiscordQueue),
        //             onFailure: new SqsDestination(failedCommandHandlerQueue.queue),
        //         });

        //         // SNS command==ping to fnSNSPingCommandToSQS
        //         const deadletter = createDeadletter(this, `not-delivered-discord-command-${name}`).queue;
        //         this.topic.addSubscription(new LambdaSubscription(fn, {
        //             filterPolicy: {
        //                 command: SubscriptionFilter.stringFilter({
        //                     allowlist: [name]
        //                 }),
        //             },
        //             deadLetterQueue: deadletter
        //         }));
        //         //deadletter.grantSendMessages(this.topic.topicArn);
        //         this.commands[name] = fn;
        //         if (onCreate) onCreate(fn);
        //         return fn;
        //     });

        // //monitor unknown commands
        // const unknownDiscord = createSqs(this, 'unknown-discord-command', {
        // })
        // this.topic.addSubscription(new SqsSubscription(unknownDiscord, {
        //     filterPolicy: {
        //         command: SubscriptionFilter.stringFilter({
        //             denylist: Object.keys(this.commands)
        //         }),
        //     },
        // }));

        // API to fnDiscordToEvent
        fnQuery.lambda.grantInvoke(stateMachineRole)
        sendMessage.lambda.grantInvoke(stateMachineRole)
        fnAuthorize.lambda.grantInvoke(apiGatewayExecuteRole);
        endpoint.addMethod('POST', new LambdaIntegration(fnAuthorize.lambda, {
            credentialsRole: apiGatewayExecuteRole,
            //official discord timeout for interaction
            timeout: Duration.seconds(10)
        }));


        // fnDiscordToEvent to SNS topic
        stateMachine.grantStartExecution(fnAuthorize.lambda);
    }
}