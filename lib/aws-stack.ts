import { NodetsFunction } from '@aws-abaschen/cdk-typescript';
import * as cdk from 'aws-cdk-lib';
import { FlowLogMaxAggregationInterval, Vpc } from 'aws-cdk-lib/aws-ec2';
import { CfnPullThroughCacheRule, Repository } from 'aws-cdk-lib/aws-ecr';
import { ContainerImage, LogDriver } from 'aws-cdk-lib/aws-ecs';
import { PerformanceMode, ThroughputMode } from 'aws-cdk-lib/aws-efs';
import { EventBus, Rule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { AnyPrincipal, Effect, ManagedPolicy, Policy, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Architecture, Runtime, Tracing } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { ARecord, HostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { CfnServer } from 'aws-cdk-lib/aws-transfer';
import { Construct } from 'constructs';

interface EnshInfraStackProps extends cdk.StackProps {
  hostedZoneId?: string,
  hostedZoneName?: string,
  recordName?: string,
  serverName: string,
  serverPassword: string,
  serverMaxSlot: string,
}

export class EnshInfraStack extends cdk.Stack {
  vpc: cdk.aws_ec2.Vpc;
  service: cdk.aws_ecs.FargateService;
  hostedZone: cdk.aws_route53.IHostedZone;
  constructor(scope: Construct, id: string, props: EnshInfraStackProps) {
    super(scope, id, props);

    const logGroup = new cdk.aws_logs.LogGroup(this, 'LogGroup', {
      logGroupName: '/ensh',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      retention: cdk.aws_logs.RetentionDays.ONE_DAY
    });
    const vpcLogGroup = new cdk.aws_logs.LogGroup(this, 'VPCLogGrurf kayle full apoup', {
      logGroupName: '/vpc/ensh',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      retention: cdk.aws_logs.RetentionDays.ONE_DAY
    });


    //create an ECS cluster
    const vpc = new Vpc(this, 'Vpc', {
      maxAzs: 2,
      natGateways: 0,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      createInternetGateway: true,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'ingress',
          subnetType: cdk.aws_ec2.SubnetType.PUBLIC,
          mapPublicIpOnLaunch: true
        }
      ],
      vpcName: 'public-vpc',
      flowLogs: {
        cw: {
          maxAggregationInterval: FlowLogMaxAggregationInterval.ONE_MINUTE,
          destination: cdk.aws_ec2.FlowLogDestination.toCloudWatchLogs(vpcLogGroup),
          trafficType: cdk.aws_ec2.FlowLogTrafficType.REJECT,
        }
      }
    });
    this.vpc = vpc;

    const cluster = new cdk.aws_ecs.Cluster(this, 'Cluster', {
      clusterName: 'ensh-cluster',
      vpc,
    });

    const repositoryName = 'github';
    const repo = new Repository(this, 'privateMirrorRepo', {
      repositoryName,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      lifecycleRules: [{
        description: 'keep last 5 images',
        maxImageCount: 2
      }],
      emptyOnDelete: true
    });

    const secret = Secret.fromSecretCompleteArn(this, 'ghcrIoSecret', `arn:aws:secretsmanager:${this.region}:${this.account}:secret:ecr-pullthroughcache/ghcr-abaschen-oZGF5j`)

    const executionRole = new cdk.aws_iam.Role(this, 'TaskExecutionRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy')],
      inlinePolicies: {
        'EcrPullThruPolicy': new cdk.aws_iam.PolicyDocument({
          statements: [new cdk.aws_iam.PolicyStatement({
            actions: [
              'ecr:GetAuthorizationToken',
              'ecr:BatchCheckLayerAvailability',
              'ecr:GetDownloadUrlForLayer',
              'ecr:BatchGetImage',
              "ecr:CreateRepository",
              "ecr:BatchImportUpstreamImage"
            ],
            resources: [`arn:aws:ecr:${this.region}:${this.account}:repository/${repositoryName}/*`],
            effect: cdk.aws_iam.Effect.ALLOW
          })]
        }),
        //ECR Pull policy using KMS and secret
        'EcrPullDecryptPolicy': new cdk.aws_iam.PolicyDocument({
          statements: [new cdk.aws_iam.PolicyStatement({
            actions: [
              "kms:Decrypt",
              "secretsmanager:GetSecretValue"
            ],
            resources: [
              secret.secretArn,
              `arn:aws:kms:${this.region}:${this.account}:aws/secretsmanager`
            ]
          })
          ]
        }),
        'CloudWatchLogs': new PolicyDocument({
          statements: [new cdk.aws_iam.PolicyStatement({
            actions: [
              "logs:CreateLogStream",
              "logs:PutLogEvents"
            ],
            resources: [
              logGroup.logGroupArn
            ]
          })
          ]
        })

      }
    });

    

    //create an EFS volume for container
    const efsSecurityGroup = new cdk.aws_ec2.SecurityGroup(this, 'EfsSecurityGroup', {
      vpc,
      allowAllOutbound: true,
      securityGroupName: 'efs-sg',
    });
    const efs = new cdk.aws_efs.FileSystem(this, 'EfsFileSystem', {
      vpc,
      encrypted: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      enableAutomaticBackups: true,
      performanceMode: PerformanceMode.GENERAL_PURPOSE,
      throughputMode: ThroughputMode.BURSTING,
      securityGroup: efsSecurityGroup
    });

    // create a Policy to access EFS root
    const efsAccessPolicy = new Policy(this, 'efsAccessPolicy', {
      statements: [
        new PolicyStatement({
          effect: Effect.ALLOW,
          actions: [
            "elasticfilesystem:ClientMount",
            "elasticfilesystem:ClientRootAccess",
            "elasticfilesystem:ClientWrite",
            "elasticfilesystem:DescribeMountTargets"
          ],
          resources: [efs.fileSystemArn]
        })
      ]
    });

    const taskRole = new cdk.aws_iam.Role(this, 'TaskRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
    });

    taskRole.attachInlinePolicy(efsAccessPolicy)

    
    const transferRole = new cdk.aws_iam.Role(this, 'TransferRole', {
      assumedBy: new cdk.aws_iam.ServicePrincipal('transfer.amazonaws.com'),
    });

    transferRole.attachInlinePolicy(efsAccessPolicy);

    efsSecurityGroup.addIngressRule(cdk.aws_ec2.Peer.anyIpv4(), cdk.aws_ec2.Port.tcp(2049), 'allow efs inbound');

    // efs.addToResourcePolicy(
    //   new PolicyStatement({
    //     effect: Effect.ALLOW,
    //     actions: [
    //       "elasticfilesystem:ClientMount",
    //       "elasticfilesystem:ClientRootAccess",
    //       "elasticfilesystem:ClientWrite",
    //       "elasticfilesystem:DescribeMountTargets"
    //     ],
    //     principals: [new AnyPrincipal()]
    //   })
    // )




    //create a task using the image from the ECR repository
    const taskDefinition = new cdk.aws_ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      executionRole,
      taskRole,
      family: 'CdkEcsInfraStackTaskDef',
      memoryLimitMiB: 10240, // 10GB
      cpu: 4096, // 4 vCPU
      //mount efs volume
      volumes: [
        {
          name: 'efs-volume',
          efsVolumeConfiguration: {
            fileSystemId: efs.fileSystemId,
            transitEncryption: 'ENABLED',
            authorizationConfig: {
              iam: 'ENABLED'
            },
          }
        }
      ],
      ephemeralStorageGiB: 40,
      runtimePlatform: {
        operatingSystemFamily: cdk.aws_ecs.OperatingSystemFamily.LINUX,
        cpuArchitecture: cdk.aws_ecs.CpuArchitecture.X86_64
      }
    })

    const cfnPullThroughCacheRule = new CfnPullThroughCacheRule(this, 'MyCfnPullThroughCacheRule', {
      credentialArn: secret.secretArn,
      ecrRepositoryPrefix: repositoryName,
      upstreamRegistry: 'github-container-registry',
      upstreamRegistryUrl: 'ghcr.io',
    });

    taskDefinition.addContainer('Container', {
      image: ContainerImage.fromRegistry(`${repo.repositoryUri}/abaschen/enshrouded-docker:main`),
      portMappings: [
        { containerPort: 15636, protocol: cdk.aws_ecs.Protocol.TCP },
        { containerPort: 15636, protocol: cdk.aws_ecs.Protocol.UDP },
        { containerPort: 15637, protocol: cdk.aws_ecs.Protocol.TCP },
        { containerPort: 15637, protocol: cdk.aws_ecs.Protocol.UDP },
      ],

      logging: LogDriver.awsLogs({
        streamPrefix: '/service',
        logGroup
      }),
      environment: {
        SERVER_NAME: props.serverName,
        //todo use ssm secret
        PASSWORD: props.serverPassword,
        SLOT_COUNT: props.serverMaxSlot
      },
      healthCheck: {
        command: ['CMD-SHELL', 'echo "Health check"'],
      },
      essential: true,
      containerName: 'enshrouded',
      gpuCount: 0,
      user: "1000:1000",
    })
      .addMountPoints({
        containerPath: '/home/steam/enshrouded',
        sourceVolume: 'efs-volume',
        readOnly: false
      });

    const serviceSecurityGroup = new cdk.aws_ec2.SecurityGroup(this, 'SecurityGroup', {
      vpc,
      allowAllOutbound: true,
    });

    //allow NFS
    serviceSecurityGroup.addIngressRule(cdk.aws_ec2.Peer.securityGroupId(efsSecurityGroup.securityGroupId), cdk.aws_ec2.Port.tcp(2049));


    //create a service for the task with desired count 1
    const service = new cdk.aws_ecs.FargateService(this, 'Service', {
      cluster,
      taskDefinition,
      desiredCount: 0,
      assignPublicIp: true,
      maxHealthyPercent: 100,
      minHealthyPercent: 50,
      enableECSManagedTags: true,
      securityGroups: [
        serviceSecurityGroup
      ]
    });
    this.service = service;

    efs.grantRootAccess(taskRole.grantPrincipal);
    efs.connections.allowDefaultPortFrom(service.connections);
    // const nlbSecurityGroup = new SecurityGroup(this, 'nlbSecurityGroup', {
    //   vpc,
    //   allowAllOutbound: false,
    //   securityGroupName: 'nlb-sg',
    // })

    // const nlb = new NetworkLoadBalancer(this, 'nlb', {
    //   vpc,
    //   internetFacing: true,
    //   securityGroups: [nlbSecurityGroup],
    //   vpcSubnets: { subnetType: SubnetType.PUBLIC }
    // });
    serviceSecurityGroup.addIngressRule(cdk.aws_ec2.Peer.anyIpv4(), cdk.aws_ec2.Port.tcpRange(15636, 15637));
    serviceSecurityGroup.addIngressRule(cdk.aws_ec2.Peer.anyIpv4(), cdk.aws_ec2.Port.udpRange(15636, 15637));
    // serviceSecurityGroup.addIngressRule(cdk.aws_ec2.Peer.securityGroupId(nlbSecurityGroup.securityGroupId), cdk.aws_ec2.Port.tcpRange(15636, 15637));
    // serviceSecurityGroup.addIngressRule(cdk.aws_ec2.Peer.securityGroupId(nlbSecurityGroup.securityGroupId), cdk.aws_ec2.Port.udpRange(15636, 15637));

    // nlbSecurityGroup.addIngressRule(cdk.aws_ec2.Peer.anyIpv4(), cdk.aws_ec2.Port.tcpRange(15636, 15637));
    // nlbSecurityGroup.addIngressRule(cdk.aws_ec2.Peer.anyIpv4(), cdk.aws_ec2.Port.udpRange(15636, 15637));
    // nlbSecurityGroup.addEgressRule(cdk.aws_ec2.Peer.anyIpv4(), cdk.aws_ec2.Port.tcpRange(15636, 15637));
    // nlbSecurityGroup.addEgressRule(cdk.aws_ec2.Peer.anyIpv4(), cdk.aws_ec2.Port.udpRange(15636, 15637));


    // [15636, 15637].forEach(port => {
    //   const targetTCP = service.loadBalancerTarget({
    //     containerName: 'enshrouded',
    //     containerPort: port,
    //     protocol: cdk.aws_ecs.Protocol.TCP,
    //   });

    //   const targetUDP = service.loadBalancerTarget({
    //     containerName: 'enshrouded',
    //     containerPort: port,
    //     protocol: cdk.aws_ecs.Protocol.UDP,
    //   });

    //   const listener = nlb.addListener(`listener-${port}-TCP`, {
    //     port,
    //     protocol: cdk.aws_elasticloadbalancingv2.Protocol.TCP,
    //   });
    //   listener.addTargets(`targetGroup-${port}-TCP`, {
    //     port,
    //     targets: [targetTCP],
    //     protocol: cdk.aws_elasticloadbalancingv2.Protocol.TCP,
    //   });
    //   const listenerUDP = nlb.addListener(`listener-${port}-UDP`, {
    //     port,
    //     protocol: cdk.aws_elasticloadbalancingv2.Protocol.UDP,
    //   });
    //   listenerUDP.addTargets(`targetGroup-${port}-UDP`, {
    //     port,
    //     targets: [targetUDP],
    //     protocol: cdk.aws_elasticloadbalancingv2.Protocol.UDP,
    //   })
    // });

    if (props.hostedZoneId && props.hostedZoneName) {
      const hostedZone = HostedZone.fromHostedZoneAttributes(this, 'hostedZone', {
        hostedZoneId: props.hostedZoneId,
        zoneName: props.hostedZoneName
      });
      this.hostedZone = hostedZone;
      const recordName = props.recordName || "ensh";
      const record = new ARecord(this, 'ARecord', {
        zone: hostedZone,
        recordName: recordName,
        deleteExisting: false,
        target: RecordTarget.fromIpAddresses("1.1.1.1")
      });

      const route53UpdaterRole = new Role(this, 'route53UpdaterRole', {
        assumedBy: new ServicePrincipal('lambda.amazonaws.com'),
        managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')],
        inlinePolicies: {
          'route53': new PolicyDocument({
            statements: [new PolicyStatement({
              actions: [
                'route53:ChangeResourceRecordSets'
              ],
              resources: [
                `arn:aws:route53:::hostedzone/${hostedZone.hostedZoneId}`
              ],
              conditions: {
                "ForAllValues:StringEquals": {
                  "route53:ChangeResourceRecordSetsNormalizedRecordNames": [`${props.recordName}.${props.hostedZoneName}`],
                  "route53:ChangeResourceRecordSetsRecordTypes": ["A"],
                  "route53:ChangeResourceRecordSetsActions": ["UPSERT"]
                }
              }
            })
            ]
          }),
          'ecs': new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: [
                  'ecs:DescribeTasks'
                ],
                resources: [
                  //only tasks from the cluster clusterId
                  `arn:aws:ecs:${this.region}:${this.account}:task/${cluster.clusterName}/*`
                ]
              })
            ]
          }),
          'describeTaskNetworkInterface': new PolicyDocument({
            statements: [
              new PolicyStatement({
                actions: [
                  'ec2:DescribeNetworkInterfaces'
                ],
                resources: [
                  //only for tasks in the cluster
                  `*`
                ]
              })
            ]
          })

        }
      }
      );

      const updater = new NodetsFunction(this, 'route53Updater', {
        entry: 'src/functions/updater/index.ts',
        runtime: Runtime.NODEJS_20_X,
        architecture: Architecture.ARM_64,
        handler: 'index.handler',
        tracing: Tracing.ACTIVE,
        timeout: cdk.Duration.seconds(30),
        retryAttempts: 0,
        role: route53UpdaterRole,
        environment: {
          RECORD_NAME: `${props.recordName}.${props.hostedZoneName}`,
          ZONE_ID: hostedZone.hostedZoneId,
          NODE_OPTIONS: '--enable-source-maps',
          CLUSTER_NAME: cluster.clusterName,
        }
      });
      const defaultBus = EventBus.fromEventBusName(this, 'defaultEventBus', 'default');
      new Rule(this, 'rule', {
        eventBus: defaultBus,
        eventPattern: {
          "source": ["aws.ecs"],
          "detailType": ["ECS Task State Change"],
          "detail": {
            "clusterArn": [cluster.clusterArn],
            "lastStatus": [{
              "equals-ignore-case": "RUNNING"
            }],
            "desiredStatus": [{
              "equals-ignore-case": "RUNNING"
            }]
          }
        },
        targets: [new LambdaFunction(updater.lambda)]
      })
    }
  }
}