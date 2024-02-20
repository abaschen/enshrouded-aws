# Enshrouded AWS Hosting and Discord bot

## Getting Started

* Add a `./.env` file with your variables. TODO: Template
* Create the EC2 TODO: do it with CDK
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* Register Discord bot with `bot.mydomain.com/discord`


## Workflow

```mermaid
sequenceDiagram
    User->>+Discord: /server status
    Discord->>+API: Interaction
    API->>Discord: ACK
    Discord->>-User: Bot thinking...
    API-->>+StepFunctions: Start execution
    StepFunctions->>StepFunctions: Do some stuff
    StepFunctions->>-Discord: PATCH /webhooks/{applicationId}/{token}/messages/@original
    Discord->>+User: Display Embed
```

[![](https://mermaid.ink/img/pako:eNptUltPwjAU_ivNeRV2c2zQByOKRmJMTNAXs5eyHaBha2cvKi7773ZMIaJ9ar7zXU5PTwO5LBAoaHy1KHKccbZWrMoEcedZoxpeXJzNuM6lKijxHfCGimjDjNU96bvY8aaPc0rmwqBiueFS9ASHuuLBY3p9fyocdkGUXElDzIaLLRdrz_OO6s57YbC-tWLvqylZGKYMwQ_M7THpF8eJTjQzSbSs0HVvV6v_FcNDm4_Tp-s74r_jciPlVvsNq-uS56xjzovWb4zcomj9CrVma9T-pVR8zQUr_4ylf50D6pLtyE21xAIGUKGqGC_c7JtOkYHZYIUZUHctcMVsaTLIROuozBq52IkcqFEWB2DrgpmfrwK6YqV2aM0E0AY-gIZR5E3GcRrEYRilySgOB7ADep4EXhynSZSmkygeh6N2AJ9SOofASyfxeZQESTJJg3E0Cvd2L_tin4kFN1I99NuyX5r2C0nBuc4?type=png)](https://mermaid.live/edit#pako:eNptUltPwjAU_ivNeRV2c2zQByOKRmJMTNAXs5eyHaBha2cvKi7773ZMIaJ9ar7zXU5PTwO5LBAoaHy1KHKccbZWrMoEcedZoxpeXJzNuM6lKijxHfCGimjDjNU96bvY8aaPc0rmwqBiueFS9ASHuuLBY3p9fyocdkGUXElDzIaLLRdrz_OO6s57YbC-tWLvqylZGKYMwQ_M7THpF8eJTjQzSbSs0HVvV6v_FcNDm4_Tp-s74r_jciPlVvsNq-uS56xjzovWb4zcomj9CrVma9T-pVR8zQUr_4ylf50D6pLtyE21xAIGUKGqGC_c7JtOkYHZYIUZUHctcMVsaTLIROuozBq52IkcqFEWB2DrgpmfrwK6YqV2aM0E0AY-gIZR5E3GcRrEYRilySgOB7ADep4EXhynSZSmkygeh6N2AJ9SOofASyfxeZQESTJJg3E0Cvd2L_tin4kFN1I99NuyX5r2C0nBuc4)